/** When an ad between rounds is allowed. Pure, so the rules are testable. */
export interface AdPolicy {
  /** Rounds played since the last ad (or the start of the session) before one is due. */
  everyRounds: number
  /** Never closer together than this, however fast the rounds go. */
  minGapMs: number
}

export const AD_POLICY: AdPolicy = { everyRounds: 5, minGapMs: 120_000 }

export interface AdTracker {
  rounds: number
  /** When the last ad was shown; null until the first. */
  lastShownAt: number | null
}

export const FRESH_TRACKER: AdTracker = { rounds: 0, lastShownAt: null }

export const roundPlayed = (tracker: AdTracker): AdTracker => ({ ...tracker, rounds: tracker.rounds + 1 })

export function isAdDue (tracker: AdTracker, now: number, policy: AdPolicy = AD_POLICY): boolean {
  if (tracker.rounds < policy.everyRounds) return false
  return tracker.lastShownAt === null || now - tracker.lastShownAt >= policy.minGapMs
}

export const adShown = (now: number): AdTracker => ({ rounds: 0, lastShownAt: now })
