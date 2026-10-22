import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ARCADE_RISKS, ARCADE_RTP, CRASH_MAX_MULTIPLIER, HORSES, PLINKO_ROWS, WHEEL_SEGMENTS, arcadePayout, crashPoint, crashStatus,
  horsePayout, horseRace, multiplierAt, plinkoDrop, plinkoMultipliers, plinkoOdds, timeToMultiplier, wheelSpin
} from '../src/index.ts'
import type { RandomInt } from '../src/index.ts'

/** A small seeded generator, so a failing run can be repeated. */
function mulberry32 (seed: number): RandomInt {
  let a = seed
  return (max) => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max)
  }
}
const fixed = (...values: number[]): RandomInt => { let i = 0; return () => values[i++ % values.length] }

describe('payouts', () => {
  test('round down to whole chips', () => {
    assert.equal(arcadePayout(10, 0.55), 5)
    assert.equal(arcadePayout(100, 1.15), 115)
    assert.equal(arcadePayout(30, 0.1 + 0.2), 9)
  })
})

describe('crash', () => {
  test('the multiplier follows time and time follows the multiplier', () => {
    assert.equal(multiplierAt(0), 1)
    for (const target of [1.01, 1.5, 2, 10, 100, 1000]) {
      const at = timeToMultiplier(target)
      assert.ok(multiplierAt(at) >= target, `${target} shown at ${at}ms`)
      assert.ok(multiplierAt(at - 1) < target, `${target} not shown a millisecond earlier`)
    }
  })

  test('the crash point is at least 1.00, at most the cap, and about 2% of flights end at 1.00', () => {
    const random = mulberry32(7)
    const runs = 200_000
    let instant = 0
    let reached2 = 0
    for (let i = 0; i < runs; i++) {
      const point = crashPoint(random)
      assert.ok(point >= 1 && point <= CRASH_MAX_MULTIPLIER)
      if (point === 1) instant++
      if (point >= 2) reached2++
    }
    // P(1.00) = 1 - 0.99 / 1.01 (the draws below 1.01), P(>= 2) = 49.5%; four standard errors of room.
    const expectedInstant = 1 - 0.99 / 1.01
    assert.ok(Math.abs(instant / runs - expectedInstant) < 4 * Math.sqrt(expectedInstant * (1 - expectedInstant) / runs), `instant ${instant / runs}`)
    assert.ok(Math.abs(reached2 / runs - 0.495) < 4 * Math.sqrt(0.25 / runs), `2x ${reached2 / runs}`)
  })

  test('the extremes of the draw', () => {
    assert.equal(crashPoint(fixed(0)), 1)
    assert.equal(crashPoint(fixed(2 ** 30 - 1)), CRASH_MAX_MULTIPLIER)
  })

  test('a flight flies, then cashes at an auto target or crashes', () => {
    assert.deepEqual(crashStatus(3, null, 0), { state: 'flying', multiplier: 1 })
    assert.equal(crashStatus(3, null, timeToMultiplier(2)).state, 'flying')
    assert.deepEqual(crashStatus(3, null, timeToMultiplier(3)), { state: 'crashed', multiplier: 3 })
    assert.deepEqual(crashStatus(3, 2, timeToMultiplier(2)), { state: 'cashed', multiplier: 2 })
    assert.equal(crashStatus(3, 2, timeToMultiplier(2) - 1).state, 'flying')
    // A target at the point itself still wins; above it, the crash comes first.
    assert.deepEqual(crashStatus(3, 3, timeToMultiplier(3)), { state: 'cashed', multiplier: 3 })
    assert.deepEqual(crashStatus(3, 5, timeToMultiplier(3)), { state: 'crashed', multiplier: 3 })
    assert.deepEqual(crashStatus(1, null, 0), { state: 'crashed', multiplier: 1 })
  })

  test('cashing out at a fixed target returns the edge on average', () => {
    const random = mulberry32(11)
    const runs = 300_000
    for (const target of [1.5, 3, 10]) {
      let returned = 0
      for (let i = 0; i < runs; i++) if (crashPoint(random) >= target) returned += target
      const rtp = returned / runs
      const deviation = 4 * target * Math.sqrt((0.99 / target) / runs)
      assert.ok(Math.abs(rtp - 0.99) < deviation, `${target}x returned ${rtp}`)
    }
  })
})

describe('plinko', () => {
  for (const risk of ARCADE_RISKS) {
    for (let rows = PLINKO_ROWS.min; rows <= PLINKO_ROWS.max; rows++) {
      test(`${rows} rows, ${risk} risk: symmetric and returns about ${ARCADE_RTP}`, () => {
        const table = plinkoMultipliers(rows, risk)
        assert.equal(table.length, rows + 1)
        assert.deepEqual([...table].reverse(), [...table])
        const rtp = plinkoOdds(rows).reduce((sum, p, slot) => sum + p * table[slot], 0)
        assert.ok(rtp > 0.975 && rtp < 0.99, `rtp ${rtp}`)
      })
    }
  }

  test('higher risk pays more at the edge and less in the middle', () => {
    const [low, medium, high] = ARCADE_RISKS.map(risk => plinkoMultipliers(16, risk))
    assert.ok(low[0] < medium[0] && medium[0] < high[0])
    assert.ok(low[8] > medium[8] && medium[8] > high[8])
  })

  test('the slot is the number of right turns', () => {
    const drop = plinkoDrop(8, 'low', fixed(1, 0, 1, 1, 0, 0, 1, 0))
    assert.equal(drop.slot, 4)
    assert.equal(drop.path.length, 8)
    assert.equal(drop.multiplier, plinkoMultipliers(8, 'low')[4])
  })

  test('refuses a board that does not exist', () => {
    assert.throws(() => plinkoDrop(7, 'low', fixed(0)))
    assert.throws(() => plinkoDrop(17, 'low', fixed(0)))
  })
})

describe('prize wheel', () => {
  for (const risk of ARCADE_RISKS) {
    test(`${risk}: twenty slices worth 98% in all`, () => {
      const segments = WHEEL_SEGMENTS[risk]
      assert.equal(segments.length, 20)
      assert.ok(Math.abs(segments.reduce((sum, m) => sum + m, 0) / segments.length - 0.98) < 1e-9)
    })
  }

  test('lands on the slice that was drawn', () => {
    assert.deepEqual(wheelSpin('high', fixed(2)), { segment: 2, multiplier: 10 })
  })
})

describe('horse race', () => {
  test('chances add up to one and every price keeps the edge', () => {
    assert.ok(Math.abs(HORSES.reduce((sum, horse) => sum + horse.chance, 0) - 1) < 1e-9)
    for (const horse of HORSES) {
      assert.ok(horse.chance * horse.odds <= ARCADE_RTP + 1e-9 && horse.chance * horse.odds > ARCADE_RTP - 0.01, horse.name)
    }
  })

  test('every horse finishes once', () => {
    const { order } = horseRace(mulberry32(3))
    assert.deepEqual([...order].sort(), HORSES.map((_, i) => i))
  })

  test('each horse wins as often as its chance says', () => {
    const random = mulberry32(5)
    const runs = 100_000
    const wins = HORSES.map(() => 0)
    for (let i = 0; i < runs; i++) wins[horseRace(random).order[0]]++
    for (const [i, horse] of HORSES.entries()) {
      const deviation = 4 * Math.sqrt(horse.chance * (1 - horse.chance) / runs)
      assert.ok(Math.abs(wins[i] / runs - horse.chance) < deviation, `${horse.name}: ${wins[i] / runs}`)
    }
  })

  test('only a bet on the winner pays', () => {
    const race = { order: [2, 0, 1, 3, 4, 5], seed: 1 }
    assert.equal(horsePayout([{ horse: 2, stake: 100 }, { horse: 0, stake: 50 }], race), Math.floor(100 * HORSES[2].odds))
    assert.equal(horsePayout([{ horse: 0, stake: 50 }], race), 0)
  })
})
