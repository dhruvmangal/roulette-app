import { bonusAvailability } from '~/utils/bonus.utils'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const now = new Date('2026-10-18T12:00:00Z')
const ago = (ms) => new Date(now.getTime() - ms)

const SIGNUP = { code: 'SIGNUP', type: 'SIGNUP', amount: 1000, cooldownSeconds: null, maxClaims: 1, minBalanceThreshold: null }
const DAILY = { code: 'DAILY', type: 'DAILY', amount: 100, cooldownSeconds: 24 * 60 * 60, maxClaims: null, minBalanceThreshold: null }
const REFILL = { code: 'REFILL', type: 'REFILL', amount: 500, cooldownSeconds: 4 * 60 * 60, maxClaims: null, minBalanceThreshold: 50 }

const claim = (claimNumber, claimedAt, streakDay = null) => ({ claimNumber, claimedAt, streakDay })

describe('bonusAvailability', () => {
  describe('signup', () => {
    it('is granted only by the server, and only once', () => {
      expect(bonusAvailability(SIGNUP, { lastClaim: null, balance: 0 }, now)).toMatchObject({ claimable: false, reason: 'AutomaticOnly' })
      expect(bonusAvailability(SIGNUP, { lastClaim: null, balance: 0, automatic: true }, now)).toMatchObject({ claimable: true, amount: 1000 })
      expect(bonusAvailability(SIGNUP, { lastClaim: claim(1, ago(DAY)), balance: 0, automatic: true }, now))
        .toMatchObject({ claimable: false, reason: 'MaxClaimsReached' })
    })
  })

  describe('daily', () => {
    it('starts a streak at day 1', () => {
      expect(bonusAvailability(DAILY, { lastClaim: null, balance: 5000 }, now)).toMatchObject({ claimable: true, amount: 100, streakDay: 1 })
    })

    it('cools down for 24 hours and says when it is next available', () => {
      expect(bonusAvailability(DAILY, { lastClaim: claim(1, ago(20 * HOUR), 1), balance: 0 }, now)).toMatchObject({
        claimable: false, reason: 'CoolingDown', nextAvailableAt: new Date(now.getTime() + 4 * HOUR)
      })
    })

    it('escalates the next day and caps at day 7', () => {
      expect(bonusAvailability(DAILY, { lastClaim: claim(1, ago(25 * HOUR), 1), balance: 0 }, now)).toMatchObject({ claimable: true, streakDay: 2, amount: 200 })
      expect(bonusAvailability(DAILY, { lastClaim: claim(9, ago(30 * HOUR), 7), balance: 0 }, now)).toMatchObject({ streakDay: 7, amount: 700 })
    })

    it('resets to day 1 after a missed day', () => {
      expect(bonusAvailability(DAILY, { lastClaim: claim(3, ago(49 * HOUR), 3), balance: 0 }, now)).toMatchObject({ claimable: true, streakDay: 1, amount: 100 })
    })
  })

  describe('refill', () => {
    it('is only for players who are nearly broke', () => {
      expect(bonusAvailability(REFILL, { lastClaim: null, balance: 50 }, now)).toMatchObject({ claimable: false, reason: 'BalanceTooHigh' })
      expect(bonusAvailability(REFILL, { lastClaim: null, balance: 49 }, now)).toMatchObject({ claimable: true, amount: 500 })
    })

    it('can be claimed again once the cooldown passes', () => {
      expect(bonusAvailability(REFILL, { lastClaim: claim(1, ago(3 * HOUR)), balance: 0 }, now)).toMatchObject({ claimable: false, reason: 'CoolingDown' })
      expect(bonusAvailability(REFILL, { lastClaim: claim(1, ago(5 * HOUR)), balance: 0 }, now)).toMatchObject({ claimable: true })
    })
  })
})
