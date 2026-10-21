import { WALLET_TRANSACTION_TYPES } from './wallet.constants'

export const BONUS_TYPES = {
  SIGNUP: 'SIGNUP',
  DAILY: 'DAILY',
  REFILL: 'REFILL',
  // Hook for future promo codes: a one-off bonus claimed by its code.
  PROMO: 'PROMO'
}

// Bonuses the server grants on its own; players cannot claim these.
export const AUTOMATIC_BONUS_TYPES = [BONUS_TYPES.SIGNUP]

export const BONUS_CODES = {
  SIGNUP: 'SIGNUP',
  DAILY: 'DAILY',
  REFILL: 'REFILL'
}

export const BONUS_LEDGER_TYPES = {
  [BONUS_TYPES.SIGNUP]: WALLET_TRANSACTION_TYPES.SIGNUP_BONUS,
  [BONUS_TYPES.DAILY]: WALLET_TRANSACTION_TYPES.DAILY_BONUS,
  [BONUS_TYPES.REFILL]: WALLET_TRANSACTION_TYPES.REFILL_BONUS,
  [BONUS_TYPES.PROMO]: WALLET_TRANSACTION_TYPES.PROMO_BONUS
}

// The daily bonus pays amount × streak day, up to this many days.
export const DAILY_STREAK_MAX_DAYS = 7
// A daily streak survives if the next claim comes within this long of the
// cooldown ending; miss it and the streak starts again at day 1.
export const DAILY_STREAK_GRACE_SECONDS = 24 * 60 * 60

export const BONUS_UNAVAILABLE_REASONS = {
  AUTOMATIC_ONLY: 'AutomaticOnly',
  MAX_CLAIMS_REACHED: 'MaxClaimsReached',
  COOLING_DOWN: 'CoolingDown',
  BALANCE_TOO_HIGH: 'BalanceTooHigh'
}
