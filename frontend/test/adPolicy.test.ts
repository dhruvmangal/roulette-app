import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adShown, FRESH_TRACKER, isAdDue, roundPlayed, type AdPolicy, type AdTracker } from '../src/ads/policy.ts'

const policy: AdPolicy = { everyRounds: 3, minGapMs: 1000 }
const after = (rounds: number, tracker: AdTracker = FRESH_TRACKER) => Array.from({ length: rounds }).reduce<AdTracker>(roundPlayed, tracker)

test('no ad before the Nth round', () => {
  assert.equal(isAdDue(after(2), 0, policy), false)
  assert.equal(isAdDue(after(3), 0, policy), true)
})

test('showing an ad restarts the count', () => {
  const tracker = adShown(10_000)
  assert.equal(tracker.rounds, 0)
  assert.equal(isAdDue(after(2, tracker), 20_000, policy), false)
  assert.equal(isAdDue(after(3, tracker), 20_000, policy), true)
})

test('the minimum gap holds even when enough rounds have passed', () => {
  const tracker = after(3, adShown(10_000))
  assert.equal(isAdDue(tracker, 10_500, policy), false)
  assert.equal(isAdDue(tracker, 11_000, policy), true)
})
