import {
  AUTOMATIC_BONUS_TYPES, BONUS_TYPES, BONUS_UNAVAILABLE_REASONS, DAILY_STREAK_GRACE_SECONDS, DAILY_STREAK_MAX_DAYS
} from '~/utils/constants/bonus.constants'

const SECOND = 1000

/**
 * Whether a player can claim a bonus right now, and for how much.
 *
 * @param {object} bonus a Bonus row
 * @param {object} player
 * @param {{ claimNumber: number, claimedAt: Date, streakDay: ?number } | null} player.lastClaim
 * @param {number} player.balance current wallet balance
 * @param {boolean} [player.automatic] true when the server grants it (signup)
 * @param {Date} now
 * @returns {{ claimable: boolean, amount: number, streakDay: ?number, reason: ?string, nextAvailableAt: ?Date }}
 */
export const bonusAvailability = (bonus, { lastClaim, balance, automatic = false }, now) => {
  const claims = lastClaim?.claimNumber ?? 0
  const streakDay = bonus.type === BONUS_TYPES.DAILY ? nextStreakDay(bonus, lastClaim, now) : null
  const amount = streakDay ? bonus.amount * streakDay : bonus.amount
  const unavailable = (reason, nextAvailableAt = null) => ({ claimable: false, amount, streakDay, reason, nextAvailableAt })

  if (AUTOMATIC_BONUS_TYPES.includes(bonus.type) && !automatic) return unavailable(BONUS_UNAVAILABLE_REASONS.AUTOMATIC_ONLY)
  if (bonus.maxClaims != null && claims >= bonus.maxClaims) return unavailable(BONUS_UNAVAILABLE_REASONS.MAX_CLAIMS_REACHED)
  if (bonus.cooldownSeconds && lastClaim) {
    const readyAt = new Date(lastClaim.claimedAt.getTime() + bonus.cooldownSeconds * SECOND)
    if (now < readyAt) return unavailable(BONUS_UNAVAILABLE_REASONS.COOLING_DOWN, readyAt)
  }
  if (bonus.minBalanceThreshold != null && balance >= bonus.minBalanceThreshold) {
    return unavailable(BONUS_UNAVAILABLE_REASONS.BALANCE_TOO_HIGH)
  }
  return { claimable: true, amount, streakDay, reason: null, nextAvailableAt: null }
}

/** Day 1 on a first claim or after a missed day; otherwise one more, up to the cap. */
const nextStreakDay = (bonus, lastClaim, now) => {
  if (!lastClaim?.streakDay) return 1
  const windowSeconds = (bonus.cooldownSeconds || 0) + DAILY_STREAK_GRACE_SECONDS
  const missed = now.getTime() - lastClaim.claimedAt.getTime() > windowSeconds * SECOND
  return missed ? 1 : Math.min(lastClaim.streakDay + 1, DAILY_STREAK_MAX_DAYS)
}
