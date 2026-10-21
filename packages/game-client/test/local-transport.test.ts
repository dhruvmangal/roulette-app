import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { getVariant, type Bet } from '@roulette/engine'
import { LocalTransport, seatOf, type LocalPlayer, type Schedule, type TableState } from '../src/index.ts'

const RED: Bet = { type: 'RED', amount: 10 }
const STRAIGHT_1: Bet = { type: 'STRAIGHT', pockets: ['1'], amount: 5 }

/** Holds scheduled bot turns until the test runs them. */
function manualClock () {
  const tasks = new Set<() => void>()
  const schedule: Schedule = task => {
    tasks.add(task)
    return () => { tasks.delete(task) }
  }
  const runAll = () => { for (const task of [...tasks]) { tasks.delete(task); task() } }
  return { schedule, runAll, get pending () { return tasks.size } }
}

/** A table whose wheel always lands on `pocket`; every other random choice is 0. */
function table (balance = 100, pocket = '1', others: LocalPlayer[] = [], clock = manualClock()) {
  const pockets = getVariant('ENGLISH').pockets
  const index = pockets.indexOf(pocket)
  return new LocalTransport({
    variant: 'ENGLISH',
    players: [{ id: 'p1', name: 'You', balance }, ...others],
    randomInt: max => max === pockets.length ? index : 0,
    schedule: clock.schedule
  })
}

const me = (transport: LocalTransport) => seatOf(transport.getState())

describe('LocalTransport betting', () => {
  test('a bet moves chips from the balance to the felt', async () => {
    const transport = table()
    assert.deepEqual(await transport.placeBet(RED), { ok: true })
    assert.equal(me(transport).balance, 90)
    assert.deepEqual(me(transport).bets, [RED])
  })

  test('rejects illegal bets and bets over the balance', async () => {
    const transport = table(8)
    assert.deepEqual(await transport.placeBet({ type: 'TOP_LINE', pockets: ['0', '1', '2', '3'], amount: 1 }), { ok: false, error: 'BetTypeNotAllowed' })
    assert.deepEqual(await transport.placeBet(RED), { ok: false, error: 'InsufficientFunds' })
    assert.equal(me(transport).balance, 8)
  })

  test('placeBets is all or nothing', async () => {
    const transport = table(12)
    assert.deepEqual(await transport.placeBets([RED, STRAIGHT_1]), { ok: false, error: 'InsufficientFunds' })
    assert.deepEqual(me(transport).bets, [])
  })

  test('undo and clear refund chips', async () => {
    const transport = table()
    await transport.placeBets([RED, STRAIGHT_1])
    await transport.undo()
    assert.deepEqual(me(transport).bets, [RED])
    assert.equal(me(transport).balance, 90)
    await transport.clear()
    assert.equal(me(transport).balance, 100)
    assert.deepEqual(await transport.undo(), { ok: false, error: 'NoBets' })
  })
})

describe('LocalTransport rounds', () => {
  test('a spin publishes the result and settles every seat', async () => {
    const transport = table()
    await transport.placeBets([RED, STRAIGHT_1])
    await transport.spin()
    const state = transport.getState()
    assert.equal(state.phase, 'RESULT')
    assert.equal(state.result?.pocket, '1')
    assert.equal(state.result?.settlements.p1.totalPayout, 20 + 180)
    assert.equal(me(transport).balance, 85 + 200)
    assert.deepEqual(state.history, ['1'])
  })

  test('betting is closed until the next round, which clears the felt', async () => {
    const transport = table()
    await transport.placeBet(RED)
    await transport.spin()
    assert.deepEqual(await transport.placeBet(RED), { ok: false, error: 'BettingClosed' })
    assert.deepEqual(await transport.nextRound(), { ok: true })
    const state = transport.getState()
    assert.equal(state.round, 2)
    assert.equal(state.phase, 'BETTING')
    assert.equal(state.result, null)
    assert.deepEqual(me(transport).bets, [])
  })

  test('nextRound is refused while betting', async () => {
    assert.deepEqual(await table().nextRound(), { ok: false, error: 'NotAllowed' })
  })
})

describe('LocalTransport snapshots', () => {
  test('every change notifies subscribers with a new snapshot', async () => {
    const transport = table()
    const seen: TableState[] = []
    const unsubscribe = transport.subscribe(state => seen.push(state))
    const before = transport.getState()
    await transport.placeBet(RED)
    unsubscribe()
    await transport.placeBet(RED)
    assert.equal(seen.length, 1)
    assert.notEqual(seen[0], before)
    assert.equal(seatOf(before).balance, 100, 'old snapshots are not mutated')
  })

  test('leaving refunds open bets and closes the table', async () => {
    const transport = table()
    await transport.placeBet(RED)
    transport.leave()
    assert.equal(me(transport).balance, 100)
    assert.equal(transport.getState().closed, true)
    assert.deepEqual(await transport.placeBet(RED), { ok: false, error: 'TableClosed' })
  })

  test('leaving after a spin keeps the payout', async () => {
    const transport = table()
    await transport.placeBet(RED)
    await transport.spin()
    transport.leave()
    assert.equal(me(transport).balance, 110)
  })
})

describe('LocalTransport bots', () => {
  const BOT: LocalPlayer = { id: 'bot1', name: 'Marcel', balance: 1000, bot: 'MARTINGALE' }

  test('bots bet on their own timer once betting opens', async () => {
    const clock = manualClock()
    const transport = table(100, '1', [BOT], clock)
    assert.equal(clock.pending, 1)
    clock.runAll()
    const bot = seatOf(transport.getState(), 'bot1')
    assert.deepEqual(bot.bets, [{ type: 'RED', amount: 25 }])
    assert.equal(bot.balance, 975)
  })

  test('a bot that has not bet yet bets when the wheel is spun', async () => {
    const clock = manualClock()
    const transport = table(100, '2', [BOT], clock)
    await transport.spin()
    assert.equal(clock.pending, 0)
    assert.equal(transport.getState().result?.settlements.bot1.totalStake, 25)
  })

  test('martingale doubles after a loss', async () => {
    const clock = manualClock()
    const transport = table(100, '2', [BOT], clock)
    await transport.spin()
    await transport.nextRound()
    clock.runAll()
    assert.deepEqual(seatOf(transport.getState(), 'bot1').bets, [{ type: 'RED', amount: 50 }])
  })

  test('leaving cancels bot timers', () => {
    const clock = manualClock()
    table(100, '1', [BOT], clock).leave()
    assert.equal(clock.pending, 0)
  })

  test('the device cannot act as a bot', async () => {
    const transport = table(100, '1', [BOT])
    assert.deepEqual(await transport.selectPlayer('bot1'), { ok: false, error: 'NotAllowed' })
    assert.deepEqual(transport.getState().localPlayers, ['p1'])
  })
})

describe('LocalTransport pass-and-play', () => {
  test('each local player bets from their own balance', async () => {
    const transport = table(100, '1', [{ id: 'p2', name: 'Ana', balance: 50 }])
    await transport.placeBet(RED)
    assert.deepEqual(await transport.selectPlayer('p2'), { ok: true })
    assert.equal(transport.getState().me, 'p2')
    await transport.placeBet(STRAIGHT_1)
    await transport.undo()
    await transport.placeBet(STRAIGHT_1)
    const state = transport.getState()
    assert.equal(seatOf(state, 'p1').balance, 90)
    assert.equal(seatOf(state, 'p2').balance, 45)
    await transport.spin()
    assert.equal(seatOf(transport.getState(), 'p2').balance, 45 + 180)
  })

  test('leaving during betting refunds every seat', async () => {
    const transport = table(100, '1', [{ id: 'p2', name: 'Ana', balance: 50 }])
    await transport.placeBet(RED)
    await transport.selectPlayer('p2')
    await transport.placeBet(RED)
    transport.leave()
    assert.deepEqual(transport.getState().seats.map(seat => seat.balance), [100, 50])
  })
})
