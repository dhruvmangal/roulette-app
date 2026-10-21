#!/usr/bin/env node
// Table chat on the live dev stack: two seated players talk, an outsider can't,
// the filter and rate limit hold, reports are stored, history survives a rejoin.
// Run from entrypoint/: node scripts/checkpoint-chat.mjs
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

async function guest () {
  const { data } = await api('POST', '/auth/guest')
  const socket = io(`${ORIGIN}/roulette`, { auth: { token: data.tokens.accessToken }, transports: ['websocket'] })
  await new Promise((resolve, reject) => { socket.on('connect', resolve); socket.on('connect_error', reject) })
  const heard = []
  socket.on('chat:message', ({ data: { message } }) => heard.push(message))
  return { token: data.tokens.accessToken, name: data.player.username, socket, heard, send: (event, payload) => socket.timeout(8000).emitWithAck(event, payload) }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 600))
const code = ack => ack.errors?.[0]?.errorCode

step('1. Two players at a private table, and one outsider')
const ana = await guest()
const ben = await guest()
const eve = await guest()
const { data: room } = await api('POST', '/rooms', ana.token, { variant: 'ENGLISH', mode: 'PRIVATE' })
const roomId = room.room.roomId
await api('POST', '/rooms/join', ben.token, { code: room.room.code })
for (const who of [ana, ben]) await who.send('room:join', { roomId })
check(code(await eve.send('chat:send', { roomId, text: 'let me in' })) === 1503, 'someone not seated at the table cannot post')

step('2. Messages reach the table, cleaned and filtered')
const hello = await ana.send('chat:send', { roomId, text: '  hello table\n\n  good luck  ' })
check(!hello.errors.length && hello.data.message.text === 'hello table good luck', `stored as "${hello.data.message.text}"`)
await ben.send('chat:send', { roomId, text: 'that was a fucking lucky spin' })
await settle()
check(ben.heard.some(m => m.text === 'hello table good luck' && m.name === ana.name), "Ben sees Ana's message with her name")
const masked = ana.heard.find(m => m.name === ben.name)?.text
check(masked === 'that was a f****** lucky spin', `Ana sees Ben's message filtered: "${masked}"`)
check(code(await ana.send('chat:send', { roomId, text: '​‮' })) === 1001, 'a message of only invisible characters is refused')

step('3. The rate limit: 5 messages per 10 seconds')
const burst = []
for (let i = 0; i < 6; i++) burst.push(code(await ben.send('chat:send', { roomId, text: `message ${i}` })))
check(burst.slice(0, 4).every(c => c === undefined) && burst.at(-1) === 1520, `Ben's 6th message in a row is refused (${burst.map(c => c ?? 'ok').join(', ')})`)

step('4. Reporting a message')
const benMessageId = ana.heard.find(m => m.name === ben.name).chatMessageId
check(!(await ana.send('chat:report', { roomId, chatMessageId: benMessageId })).errors.length, "Ana reports Ben's message")
await ana.send('chat:report', { roomId, chatMessageId: benMessageId })
check(sql(`SELECT count(*) FROM chat_reports WHERE chat_message_id = ${benMessageId}`) === '1', 'reported once, even when reported twice')
check(code(await eve.send('chat:report', { roomId, chatMessageId: benMessageId })) === 1521, "someone never at the table can't report it")

step('5. History comes back on rejoin, oldest first')
ben.socket.disconnect()
const benAgain = io(`${ORIGIN}/roulette`, { auth: { token: ben.token }, transports: ['websocket'] })
await new Promise(resolve => benAgain.on('connect', resolve))
const state = await benAgain.timeout(8000).emitWithAck('room:join', { roomId })
const texts = state.data.chat.map(m => m.text)
check(texts[0] === 'hello table good luck' && texts.length === 6, `the room state carries the ${texts.length} messages: ${texts.slice(0, 2).join(' | ')} …`)

for (const socket of [ana.socket, eve.socket, benAgain]) socket.close()
console.log('\n\x1b[32mChat checkpoint passed.\x1b[0m')
