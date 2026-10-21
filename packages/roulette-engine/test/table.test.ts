import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_SEATS, clearBets, createTable, findSeat, getVariant, joinTable, leaveTable, nextRound, placeBets,
  playBot, refundAll, spinTable, undoBet
} from '../src/index.ts'
import type { Bet, Table, TableUpdate } from '../src/index.ts'

const RED: Bet = { type: 'RED', amount: 10 }
const STRAIGHT_1: Bet = { type: 'STRAIGHT', pockets: ['1'], amount: 5 }

/** A wheel that always lands on `pocket`; every other random choice is 0. */
const landOn = (pocket: string) => {
  const pockets = getVariant('ENGLISH').pockets
  return (max: number) => max === pockets.length ? pockets.indexOf(pocket) : 0
}

const ok = (update: TableUpdate): Table => {
  if (!update.ok) throw new Error(`Refused: ${update.error}`)
  return update.table
}

const table = (...balances: number[]) =>
  createTable('ENGLISH', balances.map((balance, i) => ({ playerId: `p${i + 1}`, name: `P${i + 1}`, balance })))

const seat = (current: Table, playerId = 'p1') => findSeat(current, playerId)!

describe('seating', () => {
  test('players take the lowest free seat', () => {
    let current = ok(leaveTable(table(100, 100, 100), 'p2'))
    current = ok(joinTable(current, { playerId: 'p4', name: 'P4', balance: 100 }))
    assert.deepEqual(current.seats.map(s => [s.playerId, s.seat]), [['p1', 1], ['p4', 2], ['p3', 3]])
  })

  test('a table holds at most eight and nobody sits twice', () => {
    const full = table(...Array(MAX_SEATS).fill(100))
    assert.deepEqual(joinTable(full, { playerId: 'p9', name: 'P9', balance: 1 }), { ok: false, error: 'TableFull' })
    assert.deepEqual(joinTable(table(100), { playerId: 'p1', name: 'Again', balance: 1 }), { ok: false, error: 'AlreadySeated' })
  })

  test('leaving during betting refunds open bets', () => {
    const current = ok(placeBets(table(100, 100), 'p1', [RED]))
    assert.equal(current.seats[0].balance, 90)
    assert.deepEqual(ok(leaveTable(current, 'p1')).seats.map(s => s.playerId), ['p2'])
  })
})

describe('betting', () => {
  test('a bet moves chips from the balance to the felt', () => {
    const current = ok(placeBets(table(100), 'p1', [RED]))
    assert.equal(seat(current).balance, 90)
    assert.deepEqual(seat(current).bets, [RED])
  })

  test('bets are all or nothing and must be legal and affordable', () => {
    assert.deepEqual(placeBets(table(12), 'p1', [RED, STRAIGHT_1]), { ok: false, error: 'InsufficientFunds' })
    assert.deepEqual(placeBets(table(100), 'p1', [{ type: 'TOP_LINE', pockets: ['0', '1', '2', '3'], amount: 1 }]), { ok: false, error: 'BetTypeNotAllowed' })
    assert.deepEqual(placeBets(table(100), 'p1', []), { ok: false, error: 'NoBets' })
    assert.deepEqual(placeBets(table(100), 'nobody', [RED]), { ok: false, error: 'UnknownPlayer' })
  })

  test('undo and clear refund chips', () => {
    let current = ok(placeBets(table(100), 'p1', [RED, STRAIGHT_1]))
    current = ok(undoBet(current, 'p1'))
    assert.deepEqual(seat(current).bets, [RED])
    current = ok(clearBets(current, 'p1'))
    assert.equal(seat(current).balance, 100)
    assert.deepEqual(undoBet(current, 'p1'), { ok: false, error: 'NoBets' })
  })

  test('refundAll returns every open bet', () => {
    let current = ok(placeBets(table(100, 50), 'p1', [RED]))
    current = ok(placeBets(current, 'p2', [STRAIGHT_1]))
    assert.deepEqual(refundAll(current).seats.map(s => [s.balance, s.bets.length]), [[100, 0], [50, 0]])
  })
})

describe('rounds', () => {
  test('a spin settles every seat at once', () => {
    let current = ok(placeBets(table(100, 50), 'p1', [RED, STRAIGHT_1]))
    current = ok(placeBets(current, 'p2', [{ type: 'BLACK', amount: 20 }]))
    current = ok(spinTable(current, landOn('1')))
    assert.equal(current.phase, 'RESULT')
    assert.equal(current.result?.pocket, '1')
    assert.equal(seat(current).balance, 85 + 20 + 180)
    assert.equal(seat(current, 'p2').balance, 30)
    assert.deepEqual(current.history, ['1'])
  })

  test('betting stays closed until the next round, which clears the felt', () => {
    let current = ok(spinTable(ok(placeBets(table(100), 'p1', [RED])), landOn('1')))
    assert.deepEqual(placeBets(current, 'p1', [RED]), { ok: false, error: 'BettingClosed' })
    assert.deepEqual(spinTable(current, landOn('1')), { ok: false, error: 'BettingClosed' })
    current = ok(nextRound(current))
    assert.equal(current.round, 2)
    assert.equal(current.phase, 'BETTING')
    assert.equal(current.result, null)
    assert.equal(current.previous?.pocket, '1')
    assert.deepEqual(seat(current).bets, [])
    assert.deepEqual(nextRound(current), { ok: false, error: 'NotAllowed' })
  })

  test('functions never mutate the snapshot they are given', () => {
    const before = table(100)
    const frozen = JSON.stringify(before)
    ok(spinTable(ok(placeBets(before, 'p1', [RED])), landOn('1')))
    assert.equal(JSON.stringify(before), frozen)
  })
})

describe('bots', () => {
  const withBot = () => createTable('ENGLISH', [
    { playerId: 'p1', name: 'You', balance: 100 },
    { playerId: 'bot', name: 'Ines', balance: 1000, botStyle: 'MARTINGALE' }
  ])

  test('a bot places its strategy\'s bets', () => {
    assert.deepEqual(seat(ok(playBot(withBot(), 'bot', landOn('2'))), 'bot').bets, [{ type: 'RED', amount: 25 }])
  })

  test('a bot remembers last round, so martingale doubles after a loss', () => {
    let current = ok(spinTable(ok(playBot(withBot(), 'bot', landOn('2'))), landOn('2')))
    current = ok(playBot(ok(nextRound(current)), 'bot', landOn('2')))
    assert.deepEqual(seat(current, 'bot').bets, [{ type: 'RED', amount: 50 }])
  })

  test('only computer seats can be played as bots', () => {
    assert.deepEqual(playBot(withBot(), 'p1', landOn('2')), { ok: false, error: 'NotAllowed' })
  })
})
