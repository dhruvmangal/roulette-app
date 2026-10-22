#!/usr/bin/env node
// The arcade on the live dev stack: every game moves chips through the ledger, a flight keeps its
// crash point secret until it ends, cashing out is paid by the server's clock, a repeated
// requestId doesn't stake twice, and a flight left behind is settled.
// Run from entrypoint/: node scripts/checkpoint-arcade.mjs
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const ORIGIN = process.env.ORIGIN_URL || 'http://localhost'
const API = `${ORIGIN}/api/v1`

const step = text => console.log(`\n\x1b[1m${text}\x1b[0m`)
function check (condition, message) {
  if (!condition) {
    console.log(`\x1b[31mFAIL: ${message}\x1b[0m`)
    process.exit(1)
  }
  console.log(`  ✓ ${message}`)
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function api (method, path, token, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body)
  })
  return response.json()
}

const sql = query => execFileSync('docker', [
  'compose', '--env-file', '.env', '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml',
  'exec', '-T', 'postgres', 'sh', '-c', `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "${query}"`
]).toString().trim()

step('1. A guest with a starting balance')
const { data: signedIn } = await api('POST', '/auth/guest')
const token = signedIn.tokens.accessToken
const playerId = signedIn.player.playerId
const balance = async () => (await api('GET', '/wallet', token)).data.wallet.balance
const start = await balance()
check(start >= 1000, `starts with ${start} chips`)

step('2. Plinko, the wheel and a horse race settle through the ledger')
let expected = start
for (const [path, body] of [
  ['/arcade/plinko/play', { stake: 100, rows: 12, risk: 'high' }],
  ['/arcade/wheel/play', { stake: 50, risk: 'medium' }],
  ['/arcade/horses/play', { bets: [{ horse: 0, stake: 100 }, { horse: 4, stake: 20 }] }]
]) {
  const { data, errors } = await api('POST', path, token, { ...body, requestId: randomUUID() })
  check(!errors?.length && data.round.status === 'SETTLED', `${path} plays`)
  expected += data.round.payout - data.round.stake
  check(data.wallet.balance === expected, `${path}: balance ${data.wallet.balance} = stake taken and payout ${data.round.payout} paid`)
}
check(await balance() === expected, 'the wallet agrees')

step('3. The same requestId does not stake twice')
const requestId = randomUUID()
const first = await api('POST', '/arcade/wheel/play', token, { stake: 100, risk: 'low', requestId })
const again = await api('POST', '/arcade/wheel/play', token, { stake: 100, risk: 'low', requestId })
check(again.data.replayed === true && again.data.round.arcadeRoundId === first.data.round.arcadeRoundId, 'the second answer is the first round')
expected += first.data.round.payout - 100
check(await balance() === expected, 'chips moved once')

step('4. Limits and choices are enforced')
const tooSmall = await api('POST', '/arcade/plinko/play', token, { stake: 1, rows: 12, risk: 'low', requestId: randomUUID() })
check(tooSmall.errors?.length, 'a stake under the minimum is refused')
const dupe = await api('POST', '/arcade/horses/play', token, { bets: [{ horse: 1, stake: 10 }, { horse: 1, stake: 10 }], requestId: randomUUID() })
check(dupe.errors?.[0]?.errorCode === 1803, 'the same horse twice is refused')
const broke = await api('POST', '/arcade/wheel/play', token, { stake: 10000, risk: 'low', requestId: randomUUID() })
check(broke.errors?.[0]?.errorCode === 1301 || expected >= 10000, 'a stake the wallet cannot cover is refused')
check(await balance() === expected, 'refusals took nothing')

step('5. A crash flight keeps its end secret and cashes out on the server clock')
const flight = await api('POST', '/arcade/crash/start', token, { game: 'AVIATOR', bets: [{ stake: 100 }], requestId: randomUUID() })
check(!flight.errors?.length && flight.data.round.status === 'ACTIVE', 'the flight takes off')
check(!JSON.stringify(flight.data).includes('crashPoint'), 'the crash point is not in the response')
expected -= 100
check(flight.data.wallet.balance === expected, 'the stake was taken at take-off')
const second = await api('POST', '/arcade/crash/start', token, { game: 'AVIATOR', bets: [{ stake: 100 }], requestId: randomUUID() })
check(second.errors?.[0]?.errorCode === 1800, 'a second flight is refused while one is up')
const active = await api('GET', '/arcade/crash/active?game=AVIATOR', token)
check(active.data.round?.arcadeRoundId === flight.data.round.arcadeRoundId && !JSON.stringify(active.data).includes('crashPoint'), 'the active flight can be resumed, still secret')
await wait(1500)
const cashed = await api('POST', `/arcade/crash/${flight.data.round.arcadeRoundId}/cashout`, token, { slot: 0 })
const bet = cashed.data.round.outcome.bets[0]
check(['CASHED', 'CRASHED'].includes(bet.state), `the cash-out ended as ${bet.state}${bet.multiplier ? ` at ${bet.multiplier}x` : ''}`)
if (bet.state === 'CASHED') {
  check(bet.payout === Math.floor(100 * bet.multiplier), `paid ${bet.payout} = floor(100 x ${bet.multiplier})`)
  // The server's clock decides, not how long this script slept (a connection that sat idle can take seconds to wake).
  const flownMs = new Date(cashed.data.round.settledAt) - new Date(flight.data.round.startedAt)
  const shown = Math.floor(Math.exp(0.00008 * flownMs) * 100) / 100
  check(bet.multiplier === shown, `the multiplier ${bet.multiplier}x is what ${flownMs}ms of flight shows`)
  expected += bet.payout
}
check(cashed.data.round.status === 'SETTLED' && cashed.data.round.outcome.crashPoint >= 1, `the flight is over and its crash point (${cashed.data.round.outcome.crashPoint}x) is now told`)
check(cashed.data.wallet.balance === expected, 'balance matches')
const twice = await api('POST', `/arcade/crash/${flight.data.round.arcadeRoundId}/cashout`, token, { slot: 0 })
check(twice.data.wallet.balance === expected, 'pressing again pays nothing more')

step('6. Aviator: two bets, one cashed by hand, one left to its auto cash-out')
const plane = await api('POST', '/arcade/crash/start', token, { game: 'AVIATOR', bets: [{ stake: 100 }, { stake: 100, autoCashout: 1.01 }], requestId: randomUUID() })
check(!plane.errors?.length, 'both bets are up')
expected -= 200
await wait(700)
const landed = await api('GET', '/arcade/crash/active?game=AVIATOR', token)
const settledBets = (landed.data.round ?? landed.data.landed).outcome.bets
check(settledBets[1].state === 'CASHED' || settledBets[1].state === 'CRASHED', `the auto bet settled by itself (${settledBets[1].state})`)
if (settledBets[1].state === 'CASHED') expected += settledBets[1].payout
const rest = await api('POST', `/arcade/crash/${plane.data.round.arcadeRoundId}/cashout`, token, { slot: 0 })
const slot0 = rest.data.round.outcome.bets[0]
if (slot0.state === 'CASHED') expected += slot0.payout
check(rest.data.round.status === 'SETTLED', 'the flight ends with both bets settled')
check(await balance() === expected, 'balance matches the ledger of both bets')

step('7. A flight left behind is settled by the next one')
const left = await api('POST', '/arcade/crash/start', token, { game: 'AVIATOR', bets: [{ stake: 100, autoCashout: 1.01 }], requestId: randomUUID() })
expected -= 100
await wait(800)
const next = await api('POST', '/arcade/crash/start', token, { game: 'AVIATOR', bets: [{ stake: 100 }], requestId: randomUUID() })
check(!next.errors?.length, 'a new flight goes up')
expected -= 100
const old = sql(`SELECT status || ' ' || payout FROM arcade_rounds WHERE arcade_round_id = ${left.data.round.arcadeRoundId}`)
check(old.startsWith('SETTLED'), `the old flight settled (${old})`)
const row = sql(`SELECT outcome->'bets'->0->>'state' FROM arcade_rounds WHERE arcade_round_id = ${left.data.round.arcadeRoundId}`)
if (row === 'CASHED') expected += Math.floor(100 * 1.01)
await api('POST', `/arcade/crash/${next.data.round.arcadeRoundId}/cashout`, token, { slot: 0 })
const final = await balance()

step('8. The ledger adds up')
const ledger = sql(`SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0) FROM wallet_transactions WHERE player_id = ${playerId} AND reference_type = 'ARCADE'`)
const arcadeNet = Number(ledger)
const rounds = sql(`SELECT COALESCE(SUM(payout - stake), 0) FROM arcade_rounds WHERE player_id = ${playerId}`)
check(arcadeNet === Number(rounds), `ledger net ${arcadeNet} = rounds net ${rounds}`)
check(final - start === arcadeNet, `wallet moved ${final - start} = arcade net ${arcadeNet}`)
const history = await api('GET', '/arcade/history?limit=5', token)
check(history.data.rounds.length === 5 && history.data.rounds.every(item => item.status === 'SETTLED'), 'history lists settled plays')

console.log('\n\x1b[32mArcade checkpoint passed\x1b[0m')
