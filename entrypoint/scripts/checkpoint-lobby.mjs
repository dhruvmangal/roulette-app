#!/usr/bin/env node
// Private-table lobby on the live dev stack: a private table waits until its
// host starts it, only the host can, the host role passes on when the host
// leaves, and invite links show a preview page.
// Run from entrypoint/: node scripts/checkpoint-lobby.mjs
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

async function api (method, path, token, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body)
  })
  return response.json()
}

async function guest () {
  const { data } = await api('POST', '/auth/guest')
  const socket = io(`${ORIGIN}/roulette`, { auth: { token: data.tokens.accessToken }, transports: ['websocket'] })
  await new Promise((resolve, reject) => { socket.on('connect', resolve); socket.on('connect_error', reject) })
  const heard = []
  for (const event of ['room:updated', 'round:phase']) socket.on(event, ({ data: payload }) => heard.push({ event, payload }))
  return { token: data.tokens.accessToken, playerId: data.player.playerId, name: data.player.username, socket, heard, send: (event, payload) => socket.timeout(8000).emitWithAck(event, payload) }
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const code = ack => ack.errors?.[0]?.errorCode

step('1. A new private table is a waiting room')
const ana = await guest()
const ben = await guest()
const { data: created } = await api('POST', '/rooms', ana.token, { variant: 'ENGLISH', mode: 'PRIVATE', bots: 1 })
const { roomId, code: tableCode } = created.room
check(created.room.status === 'WAITING', `table ${tableCode} opens as WAITING`)
check(created.room.hostPlayerId === ana.playerId, 'Ana hosts it')
const joined = await api('POST', '/rooms/join', ben.token, { code: tableCode })
check(joined.data?.room.status === 'WAITING', 'Ben can join while it waits')
for (const who of [ana, ben]) await who.send('room:join', { roomId })
await pause(4000)
const waiting = await ana.send('room:join', { roomId })
check(waiting.data.round === null, 'no round is dealt while it waits, even with both players connected')
check(!ana.heard.some(h => h.event === 'round:phase'), 'no round:phase events either')

step('2. Only the host starts the game')
check(code(await ben.send('room:start', { roomId })) === 1505, 'Ben (not the host) is refused with NotRoomHost')
const started = await ana.send('room:start', { roomId })
check(!started.errors.length && started.data.room.status === 'OPEN', 'Ana starts it')
await pause(2500)
check(ben.heard.some(h => h.event === 'room:updated' && h.payload.room.status === 'OPEN'), 'Ben hears the table start')
check(ben.heard.some(h => h.event === 'round:phase' && h.payload.round.status === 'BETTING'), 'the first round opens for betting')
const again = await ana.send('room:start', { roomId })
check(!again.errors.length, 'starting again is a harmless no-op')

step('3. The host role passes on')
const before = ben.heard.length
await ana.send('room:leave', { roomId })
await pause(800)
check(ben.heard.slice(before).some(h => h.event === 'room:updated' && h.payload.room.hostPlayerId === ben.playerId), 'Ben becomes host when Ana leaves')

step('4. Invite links have a preview page')
const page = await (await fetch(`${ORIGIN}/join/${tableCode}`)).text()
check(page.includes('property="og:title"') && page.includes('invited you to play roulette'), 'the page carries an Open Graph title naming the host')
check(page.includes(`code ${tableCode}`) && page.includes('og-invite.jpg'), 'and the table code and preview image')
check(page.includes(`url=${ORIGIN}/?join=${tableCode}`), 'and forwards people to the table')
const image = await fetch(`${ORIGIN}/og-invite.jpg`)
check(image.ok && image.headers.get('content-type')?.includes('image'), 'the preview image is served')
const closed = await (await fetch(`${ORIGIN}/join/ZZZZ22`)).text()
check(closed.includes('This roulette table has closed'), 'an unknown code says the table has closed')

await ben.send('room:leave', { roomId })
for (const who of [ana, ben]) who.socket.disconnect()
console.log('\n\x1b[32mLobby checkpoint passed.\x1b[0m')
