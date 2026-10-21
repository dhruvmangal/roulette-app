#!/usr/bin/env node
// Checkpoint 4: the shared client packages play a real server table. A guest
// signs in with @roulette/api-client and plays one vs-computer round through
// SocketTransport, the same object the table UI uses.
// Run from entrypoint/: node --conditions=source scripts/checkpoint-4.mjs
import { createApiClient, memoryTokenStore } from '@roulette/api-client'
import { RemoteWalletAdapter, SocketTransport, connectRoulette, seatOf } from '@roulette/game-client'

const BASE_URL = process.env.ORIGIN_URL || 'http://localhost'
let wallet

const step = text => console.log(`\n\x1b[1m${text}\x1b[0m`)
function check (condition, message) {
  if (!condition) {
    console.log(`\x1b[31mFAIL: ${message}\x1b[0m`)
    process.exit(1)
  }
  console.log(`  ✓ ${message}`)
}

/** Resolves once the transport's state matches. */
const until = (transport, match, label, ms = 60000) => new Promise((resolve, reject) => {
  if (match(transport.getState())) return resolve(transport.getState())
  const timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), ms)
  const stop = transport.subscribe(state => {
    if (!match(state)) return
    clearTimeout(timer)
    stop()
    resolve(state)
  })
})

/** Resolves true once the wallet adapter shows `balance`, false after `ms`. */
const walletReaches = (balance, ms = 3000) => new Promise(resolve => {
  if (wallet.getBalance() === balance) return resolve(true)
  const timer = setTimeout(() => { stop(); resolve(false) }, ms)
  const stop = wallet.subscribe(next => {
    if (next !== balance) return
    clearTimeout(timer)
    stop()
    resolve(true)
  })
})

step('1. A guest signs in with the api-client')
const tokens = memoryTokenStore()
const api = createApiClient({ baseUrl: BASE_URL, tokens })
const { player } = await api.guest()
check(player.isGuest, `signed in as ${player.username}`)

step('2. Opens a vs-computer American table (2 bots, 1 round, 12s betting)')
const room = await api.createRoom({ variant: 'AMERICAN', mode: 'VS_COMPUTER', bots: 2, totalRounds: 1, bettingSeconds: 12 })
check(room.seats.length === 3, `room ${room.room.code}: you and 2 bots`)

step('3. Joins over the socket with SocketTransport')
const socket = connectRoulette({ baseUrl: BASE_URL, getAccessToken: () => tokens.get()?.accessToken ?? null })
await new Promise((resolve, reject) => { socket.on('connect', resolve); socket.on('connect_error', reject) })
wallet = new RemoteWalletAdapter({ api, socket })
await wallet.refresh()
const transport = await SocketTransport.join(socket, room.room.roomId)
const me = () => seatOf(transport.getState())
// The table opens its first round once a player is connected to it.
let state = await until(transport, s => s.phase === 'BETTING' && s.phaseEndsAt !== null, 'the first round')
check(!transport.controlsPace, 'betting is open and the server sets the pace')
check(me().balance === 1000 && wallet.getBalance() === 1000, 'seat and wallet both show 1000')
const secondsLeft = Math.round((state.phaseEndsAt - Date.now()) / 1000)
check(secondsLeft > 6 && secondsLeft <= 12, `the countdown is on this device's clock (${secondsLeft}s left)`)

step('4. Bets through the GameTransport interface')
check((await transport.placeBet({ type: 'RED', amount: 100 })).ok && me().balance === 900, 'placeBet: 100 on red, balance 900')
check((await transport.undo()).ok && me().balance === 1000 && !me().bets.length, 'undo: refunded, balance 1000')
check((await transport.placeBets([{ type: 'RED', amount: 100 }, { type: 'STRAIGHT', pockets: ['00'], amount: 10 }])).ok, 'placeBets: 100 on red + 10 on 00')
check(me().balance === 890, 'the seat shows 890 as soon as the server accepts')
// The wallet follows wallet:updated, which the server pushes separately and may land a moment later.
check(await walletReaches(890), 'the wallet adapter catches up to 890')
const refused = await transport.placeBet({ type: 'RED', amount: 1000000 })
check(!refused.ok && refused.error === 'BetLimit', `an oversized bet is refused (${refused.error})`)
check((await transport.spin()).error === 'NotAllowed', 'spin() is refused: the server spins')

step('5. The server spins; the client settles with the engine as the ball rolls')
state = await until(transport, s => s.phase === 'RESULT' && s.result, 'the spin')
const mine = state.result.settlements[state.me]
const predicted = me().balance
console.log(`  pocket ${state.result.pocket}: staked ${mine.totalStake}, returned ${mine.totalPayout}`)
check(state.history[0] === state.result.pocket, 'the pocket heads the history')
check(predicted === 890 + mine.totalPayout, `the seat shows the payout already: ${predicted}`)
const bots = state.seats.filter(seat => seat.botStyle)
check(bots.some(bot => bot.bets.length), `the bots' bets are on the felt (${bots.flatMap(bot => bot.bets).length})`)

step('6. The server settles, then closes the table after its one round')
state = await until(transport, s => s.closed, 'the table to close')
check(state.summary?.some(row => row.playerId === player.playerId), 'the session summary arrived')
const { wallet: server } = await api.wallet()
check(server.balance === predicted, `the server's wallet (${server.balance}) matches what the client predicted`)
check(await walletReaches(server.balance), 'the wallet adapter followed wallet:updated')

wallet.dispose()
socket.close()
console.log('\n\x1b[32mCheckpoint 4 passed.\x1b[0m')
