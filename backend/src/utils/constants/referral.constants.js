// Refer & earn. Both rewards are paid once, when the friend qualifies.
export const REFERRAL_REWARDS = {
  REFERRER: 1000,
  FRIEND: 500
}

// To qualify, the friend saves their account (Google or Apple, not a guest)
// and plays this many online rounds. Guests are free to make, so paying on
// sign-up alone would let anyone farm chips.
export const REFERRAL_ROUNDS_REQUIRED = 10

// A referrer is paid for at most this many friends; friends after that still get their reward.
export const REFERRAL_MAX_REWARDED = 25

// A new player can enter a friend's code for this long after joining.
export const REFERRAL_CLAIM_WINDOW_DAYS = 7

export const REFERRAL_CODE_LENGTH = 7
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const REFERRAL_CODE_PATTERN = `^[${REFERRAL_CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`

export const REFERRAL_STATUS = {
  PENDING: 'PENDING',
  REWARDED: 'REWARDED',
  REJECTED: 'REJECTED'
}

export const REFERRAL_REJECT_REASONS = {
  // The friend has played on a device the referrer has used.
  SAME_DEVICE: 'SAME_DEVICE'
}

// Why ClaimReferralService turned a code down.
export const REFERRAL_CLAIM_BLOCKS = {
  OWN_CODE: 'OwnCode',
  ALREADY_REFERRED: 'AlreadyReferred',
  TOO_LATE: 'TooLate',
  REFERRED_YOU: 'ReferredYou'
}
