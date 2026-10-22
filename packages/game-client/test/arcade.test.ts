import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { HORSES, timeToMultiplier, type RandomInt } from '@roulette/engine'
import { practiceArcade } from '../src/arcade.ts'

function wallet (start: number) {
  let balance = start
  return { getBalance: () => balance, set: (next: number) => { balance = next } }
}
const fixed = (...values: number[]): RandomInt => { let i = 0; return () => values[i++ % values.length] }

describe('practice arcade', () => {
  test('a plinko drop takes the stake and pays the slot', async () => {
    const chips = wallet(1000)
    const arcade = practiceArcade({ wallet: chips, randomInt: fixed(1) })
    const { round, balance } = await arcade.plinko({ stake: 100, rows: 8, risk: 'low' })
    assert.equal(round.outcome.slot, 8)
    assert.equal(balance, 1000 - 100 + round.payout)
    assert.equal(chips.getBalance(), balance)
  })

  test('refuses what it cannot afford and bets outside the limits', async () => {
    const arcade = practiceArcade({ wallet: wallet(50), randomInt: fixed(0) })
    await assert.rejects(arcade.wheel({ stake: 100, risk: 'low' }), /Not enough/)
    await assert.rejects(arcade.wheel({ stake: 5, risk: 'low' }), /10 to 10000/)
  })

  test('a horse race pays only the winner', async () => {
    const chips = wallet(1000)
    const arcade = practiceArcade({ wallet: chips, randomInt: fixed(0) })
    const { round } = await arcade.horses([{ horse: 0, stake: 100 }, { horse: 5, stake: 100 }])
    assert.equal(round.outcome.winner, 0)
    assert.equal(round.payout, Math.floor(100 * HORSES[0].odds))
    assert.equal(chips.getBalance(), 800 + round.payout)
  })

  describe('a flight', () => {
    // randomInt(2**30) / 2**30 = u; the flight ends at floor(0.99 / (1 - u), 2 decimals): u = 0.6706 → 3.00.
    const toThree = fixed(Math.floor(0.6706 * 2 ** 30))
    const fly = () => {
      let clock = 1_000_000
      const chips = wallet(1000)
      const arcade = practiceArcade({ wallet: chips, randomInt: toThree, now: () => clock })
      return { arcade, chips, advance: (ms: number) => { clock += ms } }
    }

    test('hides where it will end, and cashes out at the multiplier showing', async () => {
      const { arcade, chips, advance } = fly()
      const { round, balance } = await arcade.startCrash('AVIATOR', [{ stake: 100 }])
      assert.equal(balance, 900)
      assert.equal(round.outcome.crashPoint, undefined)
      advance(timeToMultiplier(2))
      const { round: after } = await arcade.cashOut(round, 0)
      assert.equal(after.status, 'SETTLED')
      assert.equal(after.outcome.bets[0].payout, 200)
      assert.equal(after.outcome.crashPoint, 3)
      assert.equal(chips.getBalance(), 1100)
    })

    test('loses a cash-out that comes after the crash', async () => {
      const { arcade, chips, advance } = fly()
      const { round } = await arcade.startCrash('AVIATOR', [{ stake: 100 }])
      advance(timeToMultiplier(3) + 1)
      const { round: after } = await arcade.cashOut(round, 0)
      assert.equal(after.outcome.bets[0].state, 'CRASHED')
      assert.equal(chips.getBalance(), 900)
    })

    test('pays an auto cash-out when the page asks again later', async () => {
      const { arcade, chips, advance } = fly()
      await arcade.startCrash('AVIATOR', [{ stake: 100, autoCashout: 1.5 }, { stake: 100 }])
      advance(timeToMultiplier(1.6))
      const { round, landed } = await arcade.activeCrash('AVIATOR')
      assert.ok(round)
      assert.equal(round.outcome.bets[0].state, 'CASHED')
      assert.equal(round.outcome.bets[1].state, 'ACTIVE')
      assert.equal(landed, null)
      advance(timeToMultiplier(3))
      const after = await arcade.activeCrash('AVIATOR')
      assert.equal(after.round, null)
      assert.equal(after.landed?.payout, 150)
      assert.equal(chips.getBalance(), 800 + 150)
    })

    test('one flight at a time, and at most two bets', async () => {
      const { arcade, advance } = fly()
      await assert.rejects(arcade.startCrash('AVIATOR', [{ stake: 10 }, { stake: 10 }, { stake: 10 }]), /one or two bets/)
      await arcade.startCrash('AVIATOR', [{ stake: 10 }])
      advance(500)
      await assert.rejects(arcade.startCrash('AVIATOR', [{ stake: 10 }]), /still in the air/)
      advance(timeToMultiplier(3))
      await arcade.startCrash('AVIATOR', [{ stake: 10 }])
    })

    test('keeps what finished in the history, newest first', async () => {
      const { arcade, advance } = fly()
      await arcade.plinko({ stake: 10, rows: 8, risk: 'low' })
      const { round } = await arcade.startCrash('AVIATOR', [{ stake: 10 }])
      advance(timeToMultiplier(3))
      await arcade.cashOut(round, 0)
      assert.deepEqual((await arcade.history()).map(item => item.game), ['AVIATOR', 'PLINKO'])
      assert.deepEqual((await arcade.history('PLINKO')).map(item => item.game), ['PLINKO'])
    })
  })
})
