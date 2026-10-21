import { PAYOUTS, getVariant, settle } from '@roulette/engine'

// How many pockets each bet covers. TOP_LINE (0, 00, 1, 2, 3) only exists on the American wheel.
const COVERED = {
  STRAIGHT: 1,
  SPLIT: 2,
  STREET: 3,
  CORNER: 4,
  TOP_LINE: 5,
  SIX_LINE: 6,
  COLUMN: 12,
  DOZEN: 12,
  RED: 18,
  BLACK: 18,
  ODD: 18,
  EVEN: 18,
  LOW: 18,
  HIGH: 18
}

export const INSIDE_BET_TYPES = ['STRAIGHT', 'SPLIT', 'STREET', 'CORNER', 'SIX_LINE', 'TOP_LINE']

/** The share of each chip the house keeps on average, e.g. 1/37 on a single-zero wheel. */
export const houseEdge = (variant, betType) => {
  const pockets = getVariant(variant).pockets.length
  return 1 - (PAYOUTS[betType] + 1) * COVERED[betType] / pockets
}

/** The timezone if Postgres and Intl both know it, otherwise UTC. */
export const safeTimeZone = (timeZone) => {
  if (!timeZone) return 'UTC'
  try {
    Intl.DateTimeFormat('en-US', { timeZone })
    return timeZone
  } catch {
    return 'UTC'
  }
}

/**
 * Longest and current runs of winning and losing rounds, from runs of rounds
 * with the same sign of net: [{ sign: 1 | 0 | -1, length, endedAt }].
 */
export const summarizeStreaks = (runs) => {
  const longest = (sign) => runs.reduce((best, run) => run.sign === sign ? Math.max(best, run.length) : best, 0)
  const latest = runs.reduce((last, run) => !last || new Date(run.endedAt) > new Date(last.endedAt) ? run : last, null)
  return {
    longestWin: longest(1),
    longestLoss: longest(-1),
    current: latest && latest.sign !== 0 ? { kind: latest.sign > 0 ? 'WIN' : 'LOSS', length: latest.length } : null
  }
}

// Ways a player could have bet the same chips on the same spins.
export const WHAT_IFS = ['ALWAYS_RED', 'RED_AND_BLACK', 'FIRST_DOZEN']

/** The bets that replace a round's real ones: the same total stake, placed one simple way. */
const alternativeBets = (what, staked) => {
  switch (what) {
    case 'ALWAYS_RED': return [{ type: 'RED', amount: staked }]
    // Half on each colour: wins back what it stakes on every number except the zeros.
    case 'RED_AND_BLACK': return [{ type: 'RED', amount: Math.floor(staked / 2) }, { type: 'BLACK', amount: staked - Math.floor(staked / 2) }].filter(bet => bet.amount > 0)
    case 'FIRST_DOZEN': return [{ type: 'DOZEN', index: 1, amount: staked }]
    default: throw new Error(`Unknown what-if "${what}"`)
  }
}

/**
 * Replays a player's real rounds with their stakes placed another way: for each
 * round ({ variant, winningPocket, staked }) the same total chips, on the very
 * spin that came up. Returns what each alternative would have netted.
 */
export const replayWithAlternatives = (rounds) => WHAT_IFS.map(what => {
  let net = 0
  for (const { variant, winningPocket, staked } of rounds) {
    if (staked < 1) continue
    const { totalStake, totalPayout } = settle(variant, alternativeBets(what, staked), winningPocket)
    net += totalPayout - totalStake
  }
  return { what, net }
})

/** Where `value` stands among `others` (the other players): the share of them it beats, 0 to 1; null when alone. */
export const shareBeaten = (value, others) => (others.length ? others.filter(other => other < value).length / others.length : null)
