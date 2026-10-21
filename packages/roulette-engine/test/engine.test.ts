import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAX_BET_AMOUNT, PAYOUTS, VARIANTS, coveredPockets, neighbors, pocketColor, settle, spin,
  tableLayout, validateBet, wheelIndex
} from '../src/index.ts'
import type { Bet, BetSelection, VariantName } from '../src/index.ts'

const NAMES: VariantName[] = ['ENGLISH', 'AMERICAN']

/** Every distinct legal bet on a variant, built from the table layout. */
function allBets (name: VariantName): BetSelection[] {
  const layout = tableLayout(name)
  return [
    ...layout.insideSpots.map(({ type, pockets }) => ({ type, pockets })),
    ...layout.outsideAreas.map(area => 'index' in area ? { type: area.type, index: area.index } : { type: area.type })
  ] as BetSelection[]
}

describe('variants', () => {
  test('pocket counts', () => {
    assert.equal(VARIANTS.ENGLISH.pockets.length, 37)
    assert.equal(VARIANTS.AMERICAN.pockets.length, 38)
  })

  for (const name of NAMES) {
    test(`${name} wheel order is a permutation of its pockets`, () => {
      const { pockets, wheelOrder } = VARIANTS[name]
      assert.equal(wheelOrder.length, pockets.length)
      assert.deepEqual([...wheelOrder].sort(), [...pockets].sort())
    })
  }

  test('colours', () => {
    assert.equal(pocketColor('0'), 'green')
    assert.equal(pocketColor('00'), 'green')
    assert.equal(pocketColor('1'), 'red')
    assert.equal(pocketColor('2'), 'black')
    assert.equal(pocketColor('36'), 'red')
    const reds = VARIANTS.ENGLISH.pockets.filter(p => pocketColor(p) === 'red')
    assert.equal(reds.length, 18)
  })

  test('wheel neighbours wrap around', () => {
    assert.deepEqual(neighbors('ENGLISH', '0', 2), ['3', '26', '0', '32', '15'])
    assert.deepEqual(neighbors('AMERICAN', '00', 1), ['1', '00', '27'])
    assert.equal(wheelIndex('AMERICAN', '00'), 19)
  })
})

describe('house edge (exhaustive over every legal bet and every pocket)', () => {
  for (const name of NAMES) {
    test(`${name}`, () => {
      const pockets = VARIANTS[name].pockets
      const bets = allBets(name)
      assert.ok(bets.length > 150, `expected many bets, got ${bets.length}`)
      for (const selection of bets) {
        const bet = { ...selection, amount: 1 } as Bet
        let totalReturn = 0
        for (const pocket of pockets) totalReturn += settle(name, [bet], pocket).totalPayout
        // EV per unit = totalReturn / N - 1, compared as integers to stay exact.
        const expectedReturn = selection.type === 'TOP_LINE' ? 35 : 36
        assert.equal(totalReturn, expectedReturn, `${JSON.stringify(selection)} returns ${totalReturn}/${pockets.length}`)
      }
    })
  }

  test('edges as fractions', () => {
    // English: 36/37 - 1 = -1/37. American: 36/38 - 1 = -2/38 (-1/19). Top line: 35/38 - 1 = -3/38.
    const ev = (name: VariantName, bet: Bet) =>
      VARIANTS[name].pockets.reduce((sum, p) => sum + settle(name, [bet], p).totalPayout, 0) - VARIANTS[name].pockets.length
    assert.equal(ev('ENGLISH', { type: 'RED', amount: 1 }), -1)
    assert.equal(ev('AMERICAN', { type: 'STRAIGHT', pockets: ['00'], amount: 1 }), -2)
    assert.equal(ev('AMERICAN', { type: 'TOP_LINE', pockets: ['0', '00', '1', '2', '3'], amount: 1 }), -3)
  })
})

describe('bet legality', () => {
  const legal = (name: VariantName, type: string, pockets: string[]) =>
    validateBet(name, { type, pockets, amount: 1 }).ok

  test('counts of inside bets', () => {
    const count = (name: VariantName, type: string) => tableLayout(name).insideSpots.filter(s => s.type === type).length
    assert.equal(count('ENGLISH', 'STRAIGHT'), 37)
    assert.equal(count('AMERICAN', 'STRAIGHT'), 38)
    assert.equal(count('ENGLISH', 'SPLIT'), 57 + 3)
    assert.equal(count('AMERICAN', 'SPLIT'), 57 + 5)
    assert.equal(count('ENGLISH', 'STREET'), 12 + 2)
    assert.equal(count('AMERICAN', 'STREET'), 12 + 2)
    assert.equal(count('ENGLISH', 'CORNER'), 22 + 1)
    assert.equal(count('AMERICAN', 'CORNER'), 22)
    assert.equal(count('ENGLISH', 'SIX_LINE'), 11)
    assert.equal(count('AMERICAN', 'TOP_LINE'), 1)
  })

  test('splits must be adjacent on the layout', () => {
    assert.ok(legal('ENGLISH', 'SPLIT', ['1', '2']))
    assert.ok(legal('ENGLISH', 'SPLIT', ['1', '4']))
    assert.ok(legal('ENGLISH', 'SPLIT', ['4', '1']), 'order does not matter')
    assert.ok(!legal('ENGLISH', 'SPLIT', ['3', '4']), '3 and 4 are in different rows')
    assert.ok(!legal('ENGLISH', 'SPLIT', ['1', '3']))
    assert.ok(!legal('ENGLISH', 'SPLIT', ['1', '5']), 'diagonal')
    assert.ok(!legal('ENGLISH', 'SPLIT', ['1', '1']))
    assert.ok(!legal('ENGLISH', 'SPLIT', ['1']))
  })

  test('streets, corners and six-lines', () => {
    assert.ok(legal('ENGLISH', 'STREET', ['1', '2', '3']))
    assert.ok(!legal('ENGLISH', 'STREET', ['2', '3', '4']))
    assert.ok(legal('ENGLISH', 'CORNER', ['1', '2', '4', '5']))
    assert.ok(legal('ENGLISH', 'CORNER', ['32', '33', '35', '36']))
    assert.ok(!legal('ENGLISH', 'CORNER', ['2', '3', '4', '5']))
    assert.ok(!legal('ENGLISH', 'CORNER', ['3', '4', '6', '7']))
    assert.ok(legal('ENGLISH', 'SIX_LINE', ['1', '2', '3', '4', '5', '6']))
    assert.ok(!legal('ENGLISH', 'SIX_LINE', ['2', '3', '4', '5', '6', '7']))
    assert.ok(!legal('ENGLISH', 'SIX_LINE', ['34', '35', '36', '1', '2', '3']))
  })

  test('zero and double-zero handling', () => {
    assert.ok(!legal('ENGLISH', 'STRAIGHT', ['00']), 'no 00 on the English wheel')
    assert.ok(legal('AMERICAN', 'STRAIGHT', ['00']))
    assert.ok(legal('AMERICAN', 'SPLIT', ['0', '00']))
    assert.ok(legal('AMERICAN', 'SPLIT', ['00', '3']))
    assert.ok(!legal('AMERICAN', 'SPLIT', ['0', '3']), 'on the American layout 0 is not next to 3')
    assert.ok(!legal('AMERICAN', 'SPLIT', ['00', '1']))
    assert.ok(legal('ENGLISH', 'SPLIT', ['0', '3']))
    assert.ok(legal('ENGLISH', 'STREET', ['0', '2', '3']))
    assert.ok(legal('AMERICAN', 'STREET', ['00', '2', '3']))
    assert.ok(legal('ENGLISH', 'CORNER', ['0', '1', '2', '3']), 'first four')
    assert.ok(!legal('AMERICAN', 'CORNER', ['0', '1', '2', '3']))
    assert.ok(legal('AMERICAN', 'TOP_LINE', ['3', '2', '1', '00', '0']))
    assert.deepEqual(validateBet('ENGLISH', { type: 'TOP_LINE', pockets: ['0', '1', '2', '3'], amount: 1 }),
      { ok: false, error: 'BetTypeNotAllowed' })
  })

  test('zeros lose every outside bet', () => {
    for (const name of NAMES) {
      for (const zero of VARIANTS[name].zeros) {
        const outside = allBets(name).filter(bet => !('pockets' in bet))
        for (const selection of outside) {
          assert.ok(!coveredPockets(name, selection).includes(zero))
        }
      }
    }
  })

  test('outside bet coverage', () => {
    assert.deepEqual(coveredPockets('ENGLISH', { type: 'COLUMN', index: 1 }).slice(0, 3), ['1', '4', '7'])
    assert.deepEqual(coveredPockets('ENGLISH', { type: 'COLUMN', index: 3 }).slice(0, 3), ['3', '6', '9'])
    assert.equal(coveredPockets('ENGLISH', { type: 'DOZEN', index: 3 })[0], '25')
    for (const type of ['RED', 'BLACK', 'ODD', 'EVEN', 'LOW', 'HIGH'] as const) {
      assert.equal(coveredPockets('AMERICAN', { type }).length, 18)
    }
  })

  test('rejects malformed and untrusted input', () => {
    const error = (name: VariantName, input: unknown) => {
      const result = validateBet(name, input)
      return result.ok ? null : result.error
    }
    assert.equal(error('ENGLISH', null), 'InvalidBet')
    assert.equal(error('ENGLISH', 'RED'), 'InvalidBet')
    assert.equal(error('ENGLISH', { type: 'toString', amount: 1 }), 'UnknownBetType')
    assert.equal(error('ENGLISH', { type: 'RED', amount: 0 }), 'InvalidAmount')
    assert.equal(error('ENGLISH', { type: 'RED', amount: -5 }), 'InvalidAmount')
    assert.equal(error('ENGLISH', { type: 'RED', amount: 1.5 }), 'InvalidAmount')
    assert.equal(error('ENGLISH', { type: 'RED', amount: '10' }), 'InvalidAmount')
    assert.equal(error('ENGLISH', { type: 'RED', amount: MAX_BET_AMOUNT + 1 }), 'InvalidAmount')
    assert.equal(error('ENGLISH', { type: 'STRAIGHT', pockets: [17], amount: 1 }), 'InvalidSelection')
    assert.equal(error('ENGLISH', { type: 'STRAIGHT', pockets: ['37'], amount: 1 }), 'InvalidSelection')
    assert.equal(error('ENGLISH', { type: 'STRAIGHT', pockets: '17', amount: 1 }), 'InvalidSelection')
    assert.equal(error('ENGLISH', { type: 'DOZEN', index: 4, amount: 1 }), 'InvalidSelection')
    assert.equal(error('ENGLISH', { type: 'DOZEN', index: '1', amount: 1 }), 'InvalidSelection')
  })

  test('validation returns a canonical bet without extra fields', () => {
    const result = validateBet('AMERICAN', { type: 'SPLIT', pockets: ['3', '00'], amount: 5, payout: 9999 })
    assert.deepEqual(result, { ok: true, bet: { type: 'SPLIT', pockets: ['00', '3'], amount: 5 }, covered: ['00', '3'] })
  })
})

describe('settle', () => {
  test('returns stake plus winnings for winners and 0 for losers', () => {
    const bets: Bet[] = [
      { type: 'STRAIGHT', pockets: ['17'], amount: 10 },
      { type: 'SPLIT', pockets: ['17', '20'], amount: 10 },
      { type: 'RED', amount: 10 },
      { type: 'BLACK', amount: 10 },
      { type: 'DOZEN', index: 2, amount: 10 },
      { type: 'COLUMN', index: 2, amount: 10 }
    ]
    const result = settle('ENGLISH', bets, '17')
    assert.deepEqual(result.results.map(r => r.payout), [360, 180, 0, 20, 30, 30])
    assert.equal(result.totalStake, 60)
    assert.equal(result.totalPayout, 620)
  })

  test('uses each bet type\'s published odds', () => {
    assert.deepEqual(PAYOUTS, {
      STRAIGHT: 35, SPLIT: 17, STREET: 11, CORNER: 8, SIX_LINE: 5, TOP_LINE: 6,
      COLUMN: 2, DOZEN: 2, RED: 1, BLACK: 1, ODD: 1, EVEN: 1, LOW: 1, HIGH: 1
    })
  })

  test('rejects an impossible winning pocket or illegal bet', () => {
    assert.throws(() => settle('ENGLISH', [], '00'))
    assert.throws(() => settle('ENGLISH', [{ type: 'SPLIT', pockets: ['1', '3'], amount: 1 }], '1'))
  })
})

describe('spin', () => {
  test('maps the injected random integer to a pocket', () => {
    assert.equal(spin('AMERICAN', () => 1), '00')
    assert.equal(spin('ENGLISH', max => max - 1), '36')
    const seen = new Set(Array.from({ length: 38 }, (_, i) => spin('AMERICAN', () => i)))
    assert.equal(seen.size, 38)
  })

  test('rejects out-of-range random values', () => {
    assert.throws(() => spin('ENGLISH', () => 37))
    assert.throws(() => spin('ENGLISH', () => -1))
    assert.throws(() => spin('ENGLISH', () => 0.5))
  })
})

test('engine source has no hidden randomness or clock', () => {
  const dir = join(import.meta.dirname, '..', 'src')
  for (const file of readdirSync(dir)) {
    const source = readFileSync(join(dir, file), 'utf8')
    assert.doesNotMatch(source, /Math\.random|Date\b|performance\.now/, file)
  }
})
