import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { BetView, Envelope, RoomState, RoundView } from '@roulette/contracts'
import { LocalTransport, SocketTransport, TableJoinError, seatOf, type SocketLike } from '../src/index.ts'

type Reply = Envelope<unknown> | 'timeout'

/** A scripted server: answers acks from `replies` and lets a test push events. */
class FakeSocket implements SocketLike {
  handlers = new Map<string, Set<(...args: any[]) => void>>()
  sent: Array<{ event: string, payload: any }> = []
  replies = new Map<string, (payload: any) => Reply>()

  on (event: string, listener: (...args: any[]) => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(listener)
  }

  off (event: string, listener: (...args: any[]) => void) {
    this.handlers.get(event)?.delete(listener)
  }

  timeout () {
    return {
      emit: (event: string, payload: any, ack: (error: Error | null, response: any) => void) => {
        this.sent.push({ event, payload })
        const reply = this.replies.get(event)?.(payload) ?? { data: {}, errors: [] }
        queueMicrotask(() => reply === 'timeout' ? ack(new Error('timeout'), null) : ack(null, reply))
      }
    }
  }

  push (event: string, data?: unknown) {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(data === undefined ? undefined : { data })
  }
}

const ok = (data: unknown): Envelope<unknown> => ({ data, errors: [] })
const failed = (errorCode: number): Envelope<unknown> => ({ data: {}, errors: [{ name: 'X', description: 'refused', errorCode }] })
const settle = () => new Promise(resolve => setImmediate(resolve))

const ROOM = 7
const ME = 10
const BOT = 11
const OTHER = 12
// The server's clock runs a minute ahead of this device.
const SKEW_MS = 60000

const round = (status: RoundView['status'], extra: Partial<RoundView> = {}): RoundView => ({
  roundId: 100,
  roundNumber: 1,
  status,
  phaseEndsAt: new Date(Date.now() + SKEW_MS + 20000).toISOString(),
  winningPocket: null,
  ...extra
})

const bet = (betId: number, roomPlayerId: number, fields: Partial<BetView>): BetView =>
  ({ betId, roomPlayerId, seat: null, status: 'PLACED', payout: null, type: 'RED', amount: 10, ...fields }) as BetView

function roomState (overrides: Partial<RoomState> = {}): RoomState {
  return {
    room: { roomId: ROOM, code: 'AB12CD', variant: 'ENGLISH', mode: 'PRIVATE', status: 'OPEN', maxSeats: 8, totalRounds: null, minBet: 1, maxBet: 5000, bettingSeconds: 20, hostPlayerId: 1 },
    seats: [
      { roomPlayerId: ME, seat: 1, isBot: false, playerId: 1, name: 'ana', botStyle: null, botBalance: null },
      { roomPlayerId: BOT, seat: 2, isBot: true, playerId: null, name: 'Marcel', botStyle: 'CAUTIOUS', botBalance: 1000 },
      { roomPlayerId: OTHER, seat: 3, isBot: false, playerId: 2, name: 'ben', botStyle: null, botBalance: null }
    ],
    round: round('BETTING'),
    bets: [],
    history: ['5'],
    me: { roomPlayerId: ME, seat: 1 },
    chat: [],
    wallet: { walletId: 1, balance: 1000, lockedBalance: 0, currency: 'CHIP', version: 1 },
    serverTime: new Date(Date.now() + SKEW_MS).toISOString(),
    ...overrides
  }
}

async function joined (state = roomState()) {
  const socket = new FakeSocket()
  socket.replies.set('room:join', () => ok(state))
  const transport = await SocketTransport.join(socket, ROOM)
  return { socket, transport, seat: (id: number) => seatOf(transport.getState(), String(id)) }
}

describe('joining', () => {
  test('presents the server table as a TableState', async () => {
    const { transport, seat } = await joined()
    const state = transport.getState()

    assert.equal(transport.controlsPace, false)
    assert.equal(state.me, String(ME))
    assert.deepEqual(state.localPlayers, [String(ME)])
    assert.equal(state.phase, 'BETTING')
    assert.equal(state.roomCode, 'AB12CD')
    assert.deepEqual(state.history, ['5'])
    assert.equal(seat(ME).balance, 1000)
    assert.equal(seat(BOT).balance, 1000)
    assert.equal(seat(BOT).botStyle, 'CAUTIOUS')
    assert.ok(Number.isNaN(seat(OTHER).balance), "another player's wallet is private")
  })

  test("converts the deadline to this device's clock", async () => {
    const { transport } = await joined()
    const left = transport.getState().phaseEndsAt! - Date.now()
    assert.ok(left > 19000 && left <= 20000, `${left}ms left`)
  })

  test('refuses a table the player is not seated at', async () => {
    const socket = new FakeSocket()
    socket.replies.set('room:join', () => failed(1503))
    await assert.rejects(SocketTransport.join(socket, ROOM), (error: TableJoinError) => error.reason === 'UnknownPlayer')
  })
})

describe('betting', () => {
  test('a placed bet lands on my seat once, even when the server echoes it', async () => {
    const { socket, transport, seat } = await joined()
    socket.replies.set('bet:place', () => ok({ bets: [bet(1, ME, { seat: 1, amount: 100 })], wallet: { balance: 900 }, replayed: false }))

    assert.deepEqual(await transport.placeBet({ type: 'RED', amount: 100 }), { ok: true })
    socket.push('bet:accepted', { roomId: ROOM, bets: [bet(1, ME, { seat: 1, amount: 100 })] })

    assert.deepEqual(seat(ME).bets, [{ type: 'RED', amount: 100 }])
    assert.equal(seat(ME).balance, 900)
    const sent = socket.sent.find(entry => entry.event === 'bet:place')!.payload
    assert.equal(sent.roomId, ROOM)
    assert.equal(typeof sent.requestId, 'string')
  })

  test("other players' and bots' bets show on their seats; bots pay from their chips", async () => {
    const { socket, seat } = await joined()
    socket.push('bet:accepted', { roomId: ROOM, bets: [bet(2, BOT, { type: 'BLACK', amount: 25 }), bet(3, OTHER, { type: 'DOZEN', index: 2, amount: 20 } as Partial<BetView>)] })

    assert.deepEqual(seat(BOT).bets, [{ type: 'BLACK', amount: 25 }])
    assert.equal(seat(BOT).balance, 975)
    assert.deepEqual(seat(OTHER).bets, [{ type: 'DOZEN', index: 2, amount: 20 }])
  })

  test('undo takes back my most recent bet', async () => {
    const { socket, transport, seat } = await joined(roomState({ bets: [bet(1, ME, { amount: 10 }), bet(4, ME, { type: 'ODD', amount: 5 })], wallet: { walletId: 1, balance: 985, lockedBalance: 0, currency: 'CHIP', version: 3 } }))
    socket.replies.set('bet:remove', () => ok({ betIds: [4], wallet: { balance: 990 } }))

    assert.deepEqual(await transport.undo(), { ok: true })
    assert.deepEqual(socket.sent.at(-1), { event: 'bet:remove', payload: { roomId: ROOM, betId: 4 } })
    assert.deepEqual(seat(ME).bets, [{ type: 'RED', amount: 10 }])
    assert.equal(seat(ME).balance, 990)
  })

  test("the server's refusals come back as action errors", async () => {
    const { socket, transport } = await joined()
    const answers: Record<string, Reply> = { 1510: failed(1510), 1301: failed(1301), 1512: failed(1512), 1511: failed(1511), timeout: 'timeout' }
    const expected: Record<string, string> = { 1510: 'BettingClosed', 1301: 'InsufficientFunds', 1512: 'BetLimit', 1511: 'InvalidBet', timeout: 'NetworkError' }
    for (const [key, reply] of Object.entries(answers)) {
      socket.replies.set('bet:place', () => reply)
      const result = await transport.placeBet({ type: 'RED', amount: 1 })
      assert.equal(result.ok ? 'ok' : result.error, expected[key])
    }
    assert.deepEqual(await transport.spin(), { ok: false, error: 'NotAllowed' })
    assert.deepEqual(await transport.nextRound(), { ok: false, error: 'NotAllowed' })
  })
})

describe('a round', () => {
  async function spunOn (pocket: string) {
    // As the server reports it: both bets already paid for, so the bot has 975 left.
    const state = roomState({ bets: [bet(1, ME, { amount: 100 }), bet(2, BOT, { type: 'BLACK', amount: 25 })], wallet: { walletId: 1, balance: 900, lockedBalance: 0, currency: 'CHIP', version: 2 } })
    state.seats[1] = { ...state.seats[1], botBalance: 975 }
    const ctx = await joined(state)
    ctx.socket.push('round:phase', { roomId: ROOM, round: round('BETS_CLOSED'), serverTime: new Date(Date.now() + SKEW_MS).toISOString() })
    ctx.socket.push('round:phase', { roomId: ROOM, round: round('SPINNING', { winningPocket: pocket }), serverTime: new Date(Date.now() + SKEW_MS).toISOString() })
    return ctx
  }

  test('betting closes without a result until the wheel spins', async () => {
    const { socket, transport } = await joined()
    socket.push('round:phase', { roomId: ROOM, round: round('BETS_CLOSED'), serverTime: new Date().toISOString() })
    assert.equal(transport.getState().phase, 'RESULT')
    assert.equal(transport.getState().result, null)
  })

  test('the spin settles the round with the engine, ahead of the server', async () => {
    const { transport, seat } = await spunOn('1')
    const state = transport.getState()

    assert.equal(state.phase, 'RESULT')
    assert.equal(state.result?.pocket, '1')
    assert.equal(state.result?.settlements[String(ME)].totalPayout, 200)
    assert.deepEqual(state.history, ['1', '5'])
    // Balances include payouts in RESULT, as LocalTransport's do.
    assert.equal(seat(ME).balance, 1100)
    assert.equal(seat(BOT).balance, 975)
  })

  test("the server's result and wallet update confirm it without paying twice", async () => {
    const { socket, seat } = await spunOn('1')
    socket.push('round:result', { roomId: ROOM, roundId: 100, roundNumber: 1, pocket: '1', seats: [{ roomPlayerId: ME, returned: 200 }, { roomPlayerId: BOT, returned: 0 }] })
    assert.equal(seat(ME).balance, 1100, 'still the predicted payout until the wallet catches up')
    socket.push('wallet:updated', { wallet: { balance: 1100 } })

    assert.equal(seat(ME).balance, 1100)
    assert.equal(seat(BOT).balance, 975)
  })

  test("a bot's winnings are added once", async () => {
    const { socket, seat } = await spunOn('2')
    assert.equal(seat(BOT).balance, 1025)
    socket.push('round:result', { roomId: ROOM, roundId: 100, roundNumber: 1, pocket: '2', seats: [{ roomPlayerId: ME, returned: 0 }, { roomPlayerId: BOT, returned: 50 }] })
    assert.equal(seat(BOT).balance, 1025)
  })

  test('the next round clears the felt and remembers the last one', async () => {
    const { socket, transport, seat } = await spunOn('1')
    socket.push('round:phase', { roomId: ROOM, round: round('SETTLED', { winningPocket: '1' }), serverTime: new Date().toISOString() })
    socket.push('wallet:updated', { wallet: { balance: 1100 } })
    socket.push('round:phase', { roomId: ROOM, round: round('BETTING', { roundId: 101, roundNumber: 2 }), serverTime: new Date().toISOString() })
    const state = transport.getState()

    assert.equal(state.phase, 'BETTING')
    assert.equal(state.round, 2)
    assert.equal(state.result, null)
    assert.equal(state.previous?.pocket, '1')
    assert.deepEqual(seat(ME).bets, [])
    assert.equal(seat(ME).balance, 1100)
    assert.deepEqual(state.history, ['1', '5'])
  })
})

describe('the table', () => {
  test('ignores events for other rooms', async () => {
    const { socket, seat } = await joined()
    socket.push('bet:accepted', { roomId: ROOM + 1, bets: [bet(9, BOT, { amount: 500 })] })
    assert.deepEqual(seat(BOT).bets, [])
  })

  test('players coming and going update the seats', async () => {
    const { socket, transport } = await joined()
    socket.push('room:playerJoined', { roomId: ROOM, seat: { roomPlayerId: 13, seat: 4, isBot: false, playerId: 3, name: 'cy', botStyle: null, botBalance: null } })
    socket.push('room:playerLeft', { roomId: ROOM, seat: { roomPlayerId: OTHER, seat: 3 } })
    assert.deepEqual(transport.getState().seats.map(s => s.name), ['ana', 'Marcel', 'cy'])
  })

  test('resyncs from the server after a reconnect', async () => {
    const { socket, transport } = await joined()
    socket.replies.set('room:join', () => ok(roomState({ round: round('SPINNING', { winningPocket: '0' }), history: ['5'] })))
    socket.push('connect')
    await settle()

    assert.equal(socket.sent.filter(entry => entry.event === 'room:join').length, 2)
    assert.equal(transport.getState().result?.pocket, '0')
    assert.deepEqual(transport.getState().history, ['0', '5'])
  })

  test('closes with the summary when the room ends', async () => {
    const { socket, transport } = await joined()
    const seen: boolean[] = []
    transport.subscribe(state => seen.push(state.closed))
    socket.push('room:ended', { roomId: ROOM, summary: [{ roomPlayerId: ME, name: 'ana', net: 40 }] })

    assert.deepEqual(seen, [true])
    assert.equal(transport.getState().summary?.[0].net, 40)
    assert.deepEqual(await transport.placeBet({ type: 'RED', amount: 1 }), { ok: false, error: 'TableClosed' })
    assert.equal(socket.handlers.get('bet:accepted')?.size, 0, 'stops listening')
  })

  test('leaving tells the server and stops listening', async () => {
    const { socket, transport } = await joined()
    transport.leave()
    assert.deepEqual(socket.sent.at(-1), { event: 'room:leave', payload: { roomId: ROOM } })
    assert.equal(transport.getState().closed, true)
  })
})

describe('chat', () => {
  const message = (chatMessageId: number, roomPlayerId: number, text: string) =>
    ({ chatMessageId, roomPlayerId, seat: 1, name: 'ana', text, sentAt: new Date().toISOString() })

  test('starts with the recent messages and adds new ones once, in order', async () => {
    const { socket, transport } = await joined(roomState({ chat: [message(1, OTHER, 'hi all')] }))
    socket.replies.set('chat:send', () => ok({ message: message(3, ME, 'good luck') }))

    assert.deepEqual(await transport.sendChat!('good luck'), { ok: true })
    socket.push('chat:message', { roomId: ROOM, message: message(3, ME, 'good luck') })
    socket.push('chat:message', { roomId: ROOM, message: message(2, OTHER, 'thanks') })

    assert.deepEqual(transport.getState().chat?.map(m => m.text), ['hi all', 'thanks', 'good luck'])
    assert.deepEqual(socket.sent.find(entry => entry.event === 'chat:send')?.payload, { roomId: ROOM, text: 'good luck' })
  })

  test('reports a message, and says when the player is sending too fast', async () => {
    const { socket, transport } = await joined()
    socket.replies.set('chat:send', () => failed(1520))
    assert.deepEqual(await transport.sendChat!('spam'), { ok: false, error: 'RateLimited' })
    socket.replies.set('chat:report', () => ok({ reported: true }))
    assert.deepEqual(await transport.reportChat!(7), { ok: true })
    assert.deepEqual(socket.sent.at(-1), { event: 'chat:report', payload: { roomId: ROOM, chatMessageId: 7 } })
  })

  test('offline tables have no chat', () => {
    assert.equal('sendChat' in Object(new LocalTransport({ variant: 'ENGLISH', players: [{ id: 'p', name: 'P', balance: 1 }], randomInt: () => 0 })), false)
  })
})
