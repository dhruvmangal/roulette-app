#!/usr/bin/env node
// Checkpoint 3: two players and two bots play a 2-round private table over
// REST + Socket.IO against the running dev stack (`make dev`), then the
// wallets and ledger are checked. Run from entrypoint/: node scripts/checkpoint-3.mjs
import { execFileSync } from 'node:child_process'
import { io } from 'socket.io-client'

const ORIGIN = process.env.ORIGIN_URL || 'http://localhost'
const API = `${ORIGIN}/api/v1`
const ROUND_TIMEOUT_MS = 60000

const bold = text => `\x1b[1m${text}\x1b[0m`
const step = text => console.log(`\n${bold(text)}`)
function check (condition, message) {
  if (!condition) {
    console.log(`\x1b[31mFAIL: ${message}\x1b[0m`)
    process.exit(1)
  }
  console.log(`  ✓ ${message}`)
}

async function api (method, path, token, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body)
  })
  return response.json()
}

function sql (query) {
  return execFileSync('docker', [
    'compose', '--env-file', '.env', '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml',
    'exec', '-T', 'postgres', 'sh', '-c', `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "${query}"`
  ]).toString().trim()
}

/** A signed-in player with a socket and everything the table sent them. */
async function player (name) {
  const guest = await api('POST', '/auth/guest', null)
  const { tokens, player: profile, wallet } = guest.data
  const username = `${name} (${profile.username})`
  const socket = io(`${ORIGIN}/roulette`, { auth: { token: tokens.accessToken }, transports: ['websocket'] })
  const events = []
  socket.onAny((event, payload) => events.push({ event, data: payload.data }))
  await new Promise((resolve, reject) => { socket.on('connect', resolve); socket.on('connect_error', reject) })
  const send = async (event, payload) => socket.timeout(10000).emitWithAck(event, payload)
  return { username, token: tokens.accessToken, playerId: profile.playerId, startBalance: wallet.balance, socket, events, send }
}

/** Resolves with the first event (from now on) that matches. */
function next (who, event, match = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ROUND_TIMEOUT_MS)
    const listener = (payload) => {
      if (!match(payload.data)) return
      clearTimeout(timer)
      who.socket.off(event, listener)
      resolve(payload.data)
    }
    who.socket.on(event, listener)
  })
}

const phase = (status) => (data) => data.round.status === status
const errorCode = (ack) => ack.errors?.[0]?.errorCode

step('1. Two players start as guests (1000 chips each)')
const ana = await player('ana')
const ben = await player('ben')
check(ana.startBalance === 1000 && ben.startBalance === 1000, 'both start with the 1000-chip signup bonus')

step('2. Ana opens a private European table: 2 bots, 2 rounds, 20s betting, max 500 a round')
const created = await api('POST', '/rooms', ana.token, { variant: 'ENGLISH', mode: 'PRIVATE', bots: 2, totalRounds: 2, bettingSeconds: 20, maxBet: 500 })
const roomId = created.data.room.roomId
console.log(`  room ${roomId}, code ${created.data.room.code}`)
check(created.data.seats.length === 3, 'Ana in seat 1, bots in seats 2 and 3')

step('3. Ben joins with the code; both subscribe over the socket')
const joined = await api('POST', '/rooms/join', ben.token, { code: created.data.room.code })
check(joined.data.me?.seat === 4, 'Ben takes seat 4')
const outsider = await player('eve')
check(errorCode(await outsider.send('room:join', { roomId })) === 1503, 'a player not seated at the table cannot subscribe to it')
let state
for (const who of [ana, ben]) {
  const ack = await who.send('room:join', { roomId })
  check(!ack.errors.length && ack.data.room.code === created.data.room.code, `${who.username} gets the table state`)
  state = ack.data
}

step('4. Round 1: betting')
// A table deals only while a player is connected, so round 1 opens as the
// players arrive: take it from the room state, or from the event if it is newer.
const seen = ana.events.find(e => e.event === 'round:phase' && e.data.round.status === 'BETTING')
const round1 = seen?.data.round ?? (state.round?.status === 'BETTING' ? state.round : (await next(ana, 'round:phase', phase('BETTING'))).round)
const openFor = new Date(round1.phaseEndsAt) - Date.now()
check(round1.roundNumber === 1, `round 1 opened once the players arrived (${Math.round(openFor / 1000)}s left)`)
check(openFor > 8000, 'enough of the betting window is left to run the checks')
const anaBets = await ana.send('bet:place', {
  roomId, requestId: 'ana-r1', bets: [{ type: 'RED', amount: 100 }, { type: 'STRAIGHT', pockets: ['17'], amount: 10 }]
})
check(!anaBets.errors.length && anaBets.data.wallet.balance === 890, 'Ana bets 100 on red + 10 on 17; wallet 890')
const replay = await ana.send('bet:place', { roomId, requestId: 'ana-r1', bets: [{ type: 'RED', amount: 100 }, { type: 'STRAIGHT', pockets: ['17'], amount: 10 }] })
check(replay.data.replayed && replay.data.bets.length === 2, 'retrying the same requestId does not bet twice')
const straight = anaBets.data.bets.find(bet => bet.type === 'STRAIGHT')
const removed = await ana.send('bet:remove', { roomId, betId: straight.betId })
check(removed.data.wallet.balance === 900, 'Ana takes back the 10 on 17; wallet 900')
check(errorCode(await ben.send('bet:place', { roomId, bets: [{ type: 'BLACK', amount: 600 }] })) === 1512, 'Ben cannot stake past the table max of 500')
check(errorCode(await ben.send('bet:place', { roomId, bets: [{ type: 'TOP_LINE', pockets: ['0', '1', '2', '3'], amount: 5 }] })) === 1511, 'the engine refuses a bet the European wheel does not have')
check(errorCode(await ben.send('bet:place', { roomId, bets: [{ type: 'BLACK', amount: 5000 }] })) === 1512, 'and anything over the limit is refused before touching the wallet')
const benBets = await ben.send('bet:place', { roomId, bets: [{ type: 'BLACK', amount: 50 }, { type: 'DOZEN', index: 2, amount: 20 }] })
check(benBets.data.wallet.balance === 930, 'Ben bets 50 on black + 20 on the 2nd dozen; wallet 930')

step('5. Round 1: no more bets, spin, result')
await next(ana, 'round:phase', phase('BETS_CLOSED'))
check(errorCode(await ben.send('bet:place', { roomId, bets: [{ type: 'RED', amount: 5 }] })) === 1510, 'a bet after betting closed is refused')
const spinning = await next(ana, 'round:phase', phase('SPINNING'))
console.log(`  the ball is rolling to ${spinning.round.winningPocket}`)
const result1 = await next(ana, 'round:result')
console.log(`  result: ${result1.pocket}`)
for (const seat of result1.seats) console.log(`    seat ${seat.seat}: staked ${seat.staked}, returned ${seat.returned}, net ${seat.net}`)
check(result1.pocket === spinning.round.winningPocket, 'the result is the pocket announced at the spin')
const botBets = ana.events.filter(e => e.event === 'bet:accepted').flatMap(e => e.data.bets).filter(bet => bet.seat === 2 || bet.seat === 3)
check(botBets.length > 0, `the bots bet too (${botBets.length} bets)`)
for (const who of [ana, ben]) {
  const mine = result1.seats.find(seat => seat.playerId === who.playerId)
  const { data } = await api('GET', '/wallet', who.token)
  check(data.wallet.balance === who.startBalance + mine.net, `${who.username}: ${who.startBalance} ${mine.net >= 0 ? '+' : '-'} ${Math.abs(mine.net)} = ${data.wallet.balance}`)
}

step('6. Round 2: Ana repeats her last bets; Ben sits it out')
await next(ana, 'round:phase', phase('BETTING'))
const repeated = await ana.send('bet:repeatLast', { roomId, requestId: 'ana-r2' })
check(repeated.data.bets.length === 1 && repeated.data.bets[0].type === 'RED' && repeated.data.bets[0].amount === 100, 'repeat places 100 on red again')
const ended = next(ana, 'room:ended')
const result2 = await next(ana, 'round:result')
console.log(`  result: ${result2.pocket}`)

step('7. The table closes after its 2 rounds with a summary')
const { summary } = await ended
for (const row of summary) console.log(`    ${row.name.padEnd(16)} rounds ${row.roundsPlayed}  staked ${row.staked}  net ${row.net}  biggest win ${row.biggestWin}`)
const anaRow = summary.find(row => row.playerId === ana.playerId)
check(Number(anaRow.roundsPlayed) === 2, 'Ana played both rounds')

step('8. Wallets and the ledger agree')
for (const who of [ana, ben]) {
  const { data } = await api('GET', '/wallet', who.token)
  const ledger = Number(sql(`SELECT coalesce(sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END), 0) FROM wallet_transactions WHERE player_id = ${who.playerId}`))
  check(data.wallet.balance === ledger, `${who.username}: wallet ${data.wallet.balance} = credits - debits ${ledger}`)
}
const broken = sql(`SELECT count(*) FROM wallets w LEFT JOIN (SELECT wallet_id, sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END) t FROM wallet_transactions GROUP BY wallet_id) l USING (wallet_id) WHERE w.balance <> coalesce(l.t, 0)`)
check(broken === '0', 'every wallet in the database matches its ledger')
const unsettled = sql(`SELECT count(*) FROM bets b JOIN rounds r USING (round_id) WHERE r.room_id = ${roomId} AND b.status = 'PLACED'`)
check(unsettled === '0', 'no bet in the room was left unsettled')
const paidTwice = sql(`SELECT count(*) FROM (SELECT reference_id FROM wallet_transactions WHERE type = 'WIN' GROUP BY reference_id HAVING count(*) > 1) d`)
check(paidTwice === '0', 'no winning bet was paid twice')

for (const who of [ana, ben, outsider]) who.socket.close()
console.log('\n\x1b[32mCheckpoint 3 passed.\x1b[0m')
