#!/usr/bin/env node
// Checkpoint 7: presence, rejoin and the leaderboard on the live dev stack.
// A table deals only while a seated player is connected; it pauses when they
// leave, keeps their seat, and resumes when they come back.
// Run from entrypoint/: node scripts/checkpoint-7.mjs
import { execFileSync } from 'node:child_process'
import { io } from 'socket.io-client'

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
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

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

async function connect (token) {
  const socket = io(`${ORIGIN}/roulette`, { auth: { token }, transports: ['websocket'] })
  await new Promise((resolve, reject) => { socket.on('connect', resolve); socket.on('connect_error', reject) })
  return socket
}

/** The next round:phase with this status, or null after `ms`. */
const phaseWithin = (socket, status, ms) => new Promise(resolve => {
  const timer = setTimeout(() => { socket.off('round:phase', listener); resolve(null) }, ms)
  const listener = ({ data }) => {
    if (data.round.status !== status) return
    clearTimeout(timer)
    socket.off('round:phase', listener)
    resolve(data.round)
  }
  socket.on('round:phase', listener)
})

step('1. A guest opens a vs-computer table; nothing is dealt until they connect')
const { data: guest } = await api('POST', '/auth/guest')
const token = guest.tokens.accessToken
const { data: created } = await api('POST', '/rooms', token, { variant: 'ENGLISH', mode: 'VS_COMPUTER', bots: 2, bettingSeconds: 10, maxBet: 500 })
const roomId = created.room.roomId
const rounds = () => Number(sql(`SELECT count(*) FROM rounds WHERE room_id = ${roomId}`))
await sleep(3000)
check(rounds() === 0, 'no round while the player is not at the table')

step('2. Connecting to the table opens round 1')
let socket = await connect(token)
const firstRound = phaseWithin(socket, 'BETTING', 8000)
const joined = await socket.timeout(8000).emitWithAck('room:join', { roomId })
check(!joined.errors.length, 'room:join accepted')
const round1 = joined.data.round?.status === 'BETTING' ? joined.data.round : await firstRound
check(round1?.roundNumber === 1, 'round 1 is taking bets')
const bet = await socket.timeout(8000).emitWithAck('bet:place', { roomId, bets: [{ type: 'RED', amount: 100 }] })
check(!bet.errors.length, 'bet 100 on red')
// A second, separate bet must count the first as a number (100 + 300 = 400, within the 500 limit).
const second = await socket.timeout(8000).emitWithAck('bet:place', { roomId, bets: [{ type: 'BLACK', amount: 300 }] })
check(!second.errors.length, 'a second bet of 300 is within the 500 table limit')
const over = await socket.timeout(8000).emitWithAck('bet:place', { roomId, bets: [{ type: 'ODD', amount: 101 }] })
check(over.errors[0]?.errorCode === 1512, 'one chip more than the limit allows is refused')

step('3. The player drops off mid-round: the round still finishes, then the table pauses')
socket.disconnect()
await sleep(1500)
check(sql(`SELECT away_since IS NOT NULL FROM room_players WHERE room_id = ${roomId} AND player_id = ${guest.player.playerId}`) === 't', 'their seat is marked away, not given up')
const { data: mine } = await api('GET', '/players/me/tables', token)
check(mine.tables.some(table => table.roomId === roomId), 'the table is listed for them to rejoin')
console.log('  waiting for round 1 to settle (about 30s)...')
const deadline = Date.now() + 60000
while (Date.now() < deadline && sql(`SELECT status FROM rounds WHERE room_id = ${roomId} AND round_number = 1`) !== 'SETTLED') await sleep(1000)
check(sql(`SELECT status FROM rounds WHERE room_id = ${roomId} AND round_number = 1`) === 'SETTLED', 'round 1 settled with nobody watching')
await sleep(15000)
check(rounds() === 1, 'no round 2 is dealt to an empty table')

step('4. Coming back resumes the table')
socket = await connect(token)
const secondRound = phaseWithin(socket, 'BETTING', 10000)
const rejoined = await socket.timeout(8000).emitWithAck('room:join', { roomId })
check(rejoined.data.history.length === 1, `the table remembers round 1 (${rejoined.data.history[0]})`)
const round2 = rejoined.data.round?.status === 'BETTING' ? rejoined.data.round : await secondRound
check(round2?.roundNumber === 2, 'round 2 opens on their return')
check(sql(`SELECT away_since IS NULL FROM room_players WHERE room_id = ${roomId} AND player_id = ${guest.player.playerId}`) === 't', 'the away mark is cleared')

step('5. The leaderboard counts the settled round')
const { data: board } = await api('GET', '/players/leaderboard?period=day', token)
const net = Number(sql(`SELECT sum(payout - amount) FROM bets WHERE player_id = ${guest.player.playerId} AND status IN ('WON', 'LOST')`))
check(board.me?.net === net, `their row shows net ${net} at rank ${board.me?.rank} of today's players`)
check(board.entries.every((row, i, all) => i === 0 || all[i - 1].net >= row.net), 'entries are ordered by net winnings')

socket.close()
console.log('\n\x1b[32mCheckpoint 7 passed.\x1b[0m')
