import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { BOT_STRATEGIES, BOT_STYLES, baseUnit, validateBet } from '../src/index.ts'
import type { BotContext, Settlement, VariantName } from '../src/index.ts'

/** A deterministic stand-in for the CSPRNG. */
function seeded (seed: number) {
  let state = seed
  return (max: number) => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state % max
  }
}

const context = (overrides: Partial<BotContext> = {}): BotContext => ({
  variant: 'AMERICAN', balance: 1000, history: [], last: null, randomInt: seeded(7), ...overrides
})

const lost = (stake: number): Settlement => ({ winningPocket: '2', results: [], totalStake: stake, totalPayout: 0 })

describe('bot strategies', () => {
  test('every style makes legal, affordable bets', () => {
    for (const variant of ['AMERICAN', 'ENGLISH'] as VariantName[]) {
      for (const style of BOT_STYLES) {
        const randomInt = seeded(style.length)
        for (let round = 0; round < 200; round++) {
          const balance = 1 + randomInt(3000)
          const bets = BOT_STRATEGIES[style]({ variant, balance, history: ['17', '17', '0'], last: null, randomInt })
          assert.ok(bets.length > 0, `${style} bet nothing with ${balance}`)
          assert.ok(bets.reduce((sum, bet) => sum + bet.amount, 0) <= balance, `${style} overspent`)
          for (const bet of bets) assert.ok(validateBet(variant, bet).ok, `${style} made ${JSON.stringify(bet)}`)
        }
      }
    }
  })

  test('bots with no chips bet nothing', () => {
    for (const style of BOT_STYLES) assert.deepEqual(BOT_STRATEGIES[style](context({ balance: 0 })), [])
  })

  test('the base unit scales with the balance', () => {
    assert.deepEqual([10, 200, 1000, 4000].map(baseUnit), [1, 5, 25, 100])
  })

  test('martingale doubles after a loss and resets when it cannot cover', () => {
    assert.deepEqual(BOT_STRATEGIES.MARTINGALE(context({ last: lost(100) })), [{ type: 'RED', amount: 200 }])
    assert.deepEqual(BOT_STRATEGIES.MARTINGALE(context({ balance: 300, last: lost(200) })), [{ type: 'RED', amount: 5 }])
  })

  test('the number chaser backs the hottest numbers', () => {
    const bets = BOT_STRATEGIES.NUMBER_CHASER(context({ history: ['17', '5', '17', '5', '17', '9'] }))
    assert.deepEqual(bets.slice(0, 2).map(bet => 'pockets' in bet && bet.pockets[0]), ['17', '5'])
  })
})
