import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getVariant } from '@roulette/engine'
import { STRATEGIES, betHouseEdge, simulateSession, summarizeSessions, type StrategyId } from '../src/index.ts'

const pockets = getVariant('ENGLISH').pockets
/** A wheel that lands on these pockets in turn; other draws (hot-number top-ups) take the first pocket. */
const rigged = (landings: string[]) => {
  let next = 0
  return (max: number) => max === pockets.length && next < landings.length ? pockets.indexOf(landings[next++]) : 0
}
/** mulberry32, a small seeded generator, so the large-sample checks are repeatable. */
const seeded = (seed: number) => (max: number) => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * max)
}

test('every system places bets the engine accepts', () => {
  for (const id of Object.keys(STRATEGIES) as StrategyId[]) {
    const result = simulateSession({ strategy: id, variant: 'AMERICAN', bankroll: 1000, unit: 5, rounds: 50, randomInt: seeded(7) })
    assert.ok(result.roundsPlayed > 0, id)
  }
})

test('Martingale doubles through losses and one win recovers them plus a unit', () => {
  // 2 is black: three losses (10, 20, 40), then 1 (red) wins 80.
  const result = simulateSession({ strategy: 'MARTINGALE', variant: 'ENGLISH', bankroll: 1000, unit: 10, rounds: 4, randomInt: rigged(['2', '2', '2', '1']) })
  assert.deepEqual(result.path, [1000, 990, 970, 930, 1010])
  assert.equal(result.biggestStake, 80)
})

test('a progression that outgrows the bankroll starts over, and the session ends when the base bet is out of reach', () => {
  const result = simulateSession({ strategy: 'MARTINGALE', variant: 'ENGLISH', bankroll: 70, unit: 10, rounds: 10, randomInt: rigged(Array(10).fill('2')) })
  // Loses 10, 20, then all 40 that is left.
  assert.deepEqual(result.path, [70, 60, 40, 0])
  assert.equal(result.bustRound, 4)

  const reset = simulateSession({ strategy: 'MARTINGALE', variant: 'ENGLISH', bankroll: 50, unit: 10, rounds: 3, randomInt: rigged(['2', '2', '1']) })
  // Loses 10 and 20, can't cover 40 with 20 left, so bets 10 again and wins.
  assert.deepEqual(reset.path, [50, 40, 20, 30])
  assert.equal(reset.forcedResets, 1)
})

test('Paroli banks after three wins in a row', () => {
  const result = simulateSession({ strategy: 'PAROLI', variant: 'ENGLISH', bankroll: 100, unit: 1, rounds: 4, randomInt: rigged(['1', '1', '1', '1']) })
  assert.deepEqual(result.path, [100, 101, 103, 107, 108])
})

test('the James Bond bets cost 20 units and the house edge is 1/37 on each', () => {
  const bets = STRATEGIES.JAMES_BOND.bets({ variant: 'ENGLISH', unit: 1, step: 0, history: [], randomInt: () => 0 })
  assert.equal(bets.reduce((sum, bet) => sum + bet.amount, 0), 20)
  for (const bet of bets) assert.ok(Math.abs(betHouseEdge('ENGLISH', bet) - 1 / 37) < 1e-12)
})

test('hot numbers backs the most frequent recent pockets', () => {
  const bets = STRATEGIES.HOT_NUMBERS.bets({ variant: 'ENGLISH', unit: 1, step: 0, history: ['7', '7', '7', '9', '9', '12', '3'], randomInt: () => 0 })
  assert.deepEqual(bets.map(bet => 'pockets' in bet ? bet.pockets[0] : null), ['7', '9', '12'])
})

test('over many sessions no system beats what the house edge predicts', () => {
  for (const id of Object.keys(STRATEGIES) as StrategyId[]) {
    const randomInt = seeded(42)
    const results = Array.from({ length: 2000 }, () => simulateSession({ strategy: id, variant: 'ENGLISH', bankroll: 1000, unit: 5, rounds: 100, randomInt }))
    const summary = summarizeSessions(results, 1000)
    // Within four standard errors: Martingale's rare big losses make its spread wide.
    const nets = results.map(result => result.final - 1000)
    const variance = nets.reduce((sum, net) => sum + (net - summary.averageNet) ** 2, 0) / (nets.length - 1)
    const standardError = Math.sqrt(variance / nets.length)
    assert.ok(Math.abs(summary.averageNet - summary.averageExpectedNet) < 4 * standardError, `${id}: ${summary.averageNet} vs ${summary.averageExpectedNet} ± ${standardError}`)
  }
})
