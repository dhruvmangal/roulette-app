#!/usr/bin/env node
// Friends, achievements and notifications on the live dev stack: requests and invites
// arrive in real time, presence follows connections, and a played round earns
// achievements whose chip reward reaches the wallet.
// Run from entrypoint/: node scripts/checkpoint-social.mjs   (about 40 seconds)
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
  return { status: response.status, ...(await response.json()) }
}
const errorCode = response => response.errors?.[0]?.errorCode

const EVENTS = ['round:phase', 'friend:request', 'friend:accepted', 'friend:invited', 'achievement:unlocked', 'wallet:updated', 'round:result']

async function player () {
  const { data } = await api('POST', '/auth/guest')
  const socket = io(`${ORIGIN}/roulette`, { auth: { token: data.tokens.accessToken }, transports: ['websocket'] })
  await new Promise((resolve, reject) => { socket.on('connect', resolve); socket.on('connect_error', reject) })
  const heard = Object.fromEntries(EVENTS.map(event => [event, []]))
  for (const event of EVENTS) socket.on(event, payload => heard[event].push(payload.data ?? payload))
  const waiter = (event, match = () => true, ms = 60000) => new Promise((resolve, reject) => {
    const found = heard[event].find(match)
    if (found) return resolve(found)
    const timer = setTimeout(() => reject(new Error(`${data.player.username}: timed out waiting for ${event}`)), ms)
    const listener = payload => { const body = payload.data ?? payload; if (match(body)) { clearTimeout(timer); socket.off(event, listener); resolve(body) } }
    socket.on(event, listener)
  })
  return {
    id: data.player.playerId,
    name: data.player.username,
    token: data.tokens.accessToken,
    socket,
    heard,
    waitFor: waiter,
    send: (event, payload) => socket.timeout(8000).emitWithAck(event, payload),
    get: (path) => api('GET', path, data.tokens.accessToken),
    post: (path, body) => api('POST', path, data.tokens.accessToken, body)
  }
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

step('1. Two connected players')
const ana = await player()
const ben = await player()
check(ana.id !== ben.id, `Ana (#${ana.id}) and Ben (#${ben.id}) are connected`)

step('2. A friend request arrives live')
const asked = await ana.post('/friends/requests', { username: ben.name })
check(asked.data.status === 'PENDING', 'Ana asks Ben by username')
const request = await ben.waitFor('friend:request', body => body.from.playerId === ana.id, 5000)
check(request.from.username === ana.name, 'Ben is told in real time who asked')
check((await ben.get('/friends')).data.incoming.length === 1, "the request is in Ben's inbox")
check(errorCode(await ana.post('/friends/requests', { username: ana.name })) === 1710, 'nobody can ask themselves')
check(errorCode(await ana.post('/friends/requests', { username: 'no_such_player_77' })) === 1714, 'an unknown name is refused')

step('3. Accepting: both are told, both earn "First friend"')
const friendshipId = (await ben.get('/friends')).data.incoming[0].friendshipId
check((await ben.post(`/friends/requests/${friendshipId}/accept`)).data.status === 'ACCEPTED', 'Ben accepts')
await ana.waitFor('friend:accepted', body => body.from.playerId === ben.id, 5000)
check(true, 'Ana is told Ben accepted')
for (const who of [ana, ben]) {
  const unlocked = await who.waitFor('achievement:unlocked', body => body.code === 'FIRST_FRIEND', 8000)
  check(unlocked.reward === 100, `${who.name} unlocks FIRST_FRIEND (+${unlocked.reward} chips) live`)
}
await pause(300)
check((await ana.get('/achievements/me')).data.achievements.find(entry => entry.code === 'FIRST_FRIEND').unlockedAt, 'it is saved, with its date')
check((await ana.get('/wallet')).data.wallet.balance === 1100, 'the 100 chips reached the wallet (1,000 + 100)')

step('4. Presence and invites')
const friends = (await ana.get('/friends')).data.friends
check(friends.length === 1 && friends[0].online === true && friends[0].table === null, 'Ana sees Ben online, at no table')
const { data: room } = await ana.post('/rooms', { variant: 'ENGLISH', mode: 'PRIVATE', bots: 0 }).then(r => ({ data: r.data }))
const roomId = room.room.roomId
await ana.send('room:join', { roomId })
const seen = (await ben.get('/friends')).data.friends[0]
check(seen.table?.code === room.room.code && seen.table.hasRoom, `Ben sees Ana at table ${room.room.code}`)
check((await ana.post(`/friends/${ben.id}/invite`, { code: room.room.code })).data.invited, 'Ana invites Ben')
const invite = await ben.waitFor('friend:invited', body => body.code === room.room.code, 5000)
check(invite.from.username === ana.name && invite.variant === 'ENGLISH', 'Ben gets the invitation live, with the table code')
check(errorCode(await ana.post(`/friends/${ben.id}/invite`, { code: room.room.code })) === 1713, 'a second invite within a minute is refused')
ben.socket.disconnect()
await pause(4000)
check((await ana.get('/friends')).data.friends[0].online === false, 'when Ben disconnects he shows offline (within the presence cache)')

step('5. A played round earns achievements')
const { data: practice } = await ana.post('/rooms', { variant: 'ENGLISH', mode: 'VS_COMPUTER', bots: 1, bettingSeconds: 10 }).then(r => ({ data: r.data }))
const joined = await ana.send('room:join', { roomId: practice.room.roomId })
// The first round may already be open when she joins, or open a moment later.
if (joined.data?.room?.round?.status !== 'BETTING' && joined.data?.round?.status !== 'BETTING') {
  await ana.waitFor('round:phase', body => body.round.status === 'BETTING', 20000)
}
const placed = await ana.send('bet:place', { roomId: practice.room.roomId, requestId: 'social-1', bets: [{ type: 'RED', amount: 25 }, { type: 'STRAIGHT', pockets: ['17'], amount: 5 }] })
check(!placed.errors?.length, `Ana bets on red and on 17 ${JSON.stringify(placed.errors ?? '')}`)
const first = await ana.waitFor('achievement:unlocked', body => body.code === 'FIRST_SPIN', 70000)
check(first.reward === 50, 'she unlocks FIRST_SPIN as the round settles')
const list = (await ana.get('/achievements/me')).data
const spin = list.achievements.find(entry => entry.code === 'FIRST_SPIN')
check(spin.unlockedAt && spin.progress === spin.target, 'it shows as earned in her list')
check(list.achievements.find(entry => entry.code === 'BOTH_WHEELS').progress === 1, 'progress toward "Both wheels" is 1 of 2')
check(list.totals.unlocked >= 2, `${list.totals.unlocked} earned so far, ${list.totals.chipsEarned} chips`)

step('6. Notification settings')
check((await ana.get('/notifications/settings')).data.devices === 0, 'no phone is registered yet')
check((await ana.post('/notifications/tokens', { token: 'x'.repeat(40), platform: 'ios', language: 'es' })).data.registered, 'a phone registers')
check((await ana.get('/notifications/settings')).data.devices === 1, 'it counts as one device')
await pause(100)

for (const who of [ana, ben]) who.socket.disconnect()
console.log('\n\x1b[32mAll social checks passed.\x1b[0m')
process.exit(0)
