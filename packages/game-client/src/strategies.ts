import { PAYOUTS, coveredPockets, getVariant, settle, spin } from '@roulette/engine'
import type { Bet, Pocket, RandomInt, VariantName } from '@roulette/engine'

/**
 * Betting systems players ask about, played for real against the engine so
 * the Learn screen can show what each one does to a bankroll over time.
 */
export type StrategyId = 'FLAT' | 'MARTINGALE' | 'PAROLI' | 'DALEMBERT' | 'FIBONACCI' | 'JAMES_BOND' | 'HOT_NUMBERS'

export interface StrategyContext {
  variant: VariantName
  /** The base stake. */
  unit: number
  /** Where the system is in its progression (its meaning depends on the system). */
  step: number
  /** Winning pockets, newest first. */
  history: readonly Pocket[]
  randomInt: RandomInt
}

export interface Strategy {
  id: StrategyId
  /** The progression step a session starts at. */
  start: number
  bets: (context: StrategyContext) => Bet[]
  /** The step after a round that ended with this net result. */
  next: (step: number, net: number) => number
}

const HOT_WINDOW = 30
const fibonacci = (n: number) => { let a = 1; let b = 1; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a }
const red = (amount: number): Bet[] => [{ type: 'RED', amount }]

export const STRATEGIES: Readonly<Record<StrategyId, Strategy>> = {
  /** The same stake on red every round. */
  FLAT: { id: 'FLAT', start: 0, bets: ({ unit }) => red(unit), next: () => 0 },
  /** Doubles after every loss so one win recovers everything; back to one unit after a win. */
  MARTINGALE: { id: 'MARTINGALE', start: 1, bets: ({ unit, step }) => red(unit * step), next: (step, net) => net < 0 ? step * 2 : 1 },
  /** Reverse Martingale: doubles after a win, banks after three in a row, back to one unit after a loss. */
  PAROLI: { id: 'PAROLI', start: 0, bets: ({ unit, step }) => red(unit * 2 ** step), next: (step, net) => net > 0 ? (step + 1) % 3 : 0 },
  /** One unit more after a loss, one unit less after a win. */
  DALEMBERT: { id: 'DALEMBERT', start: 1, bets: ({ unit, step }) => red(unit * step), next: (step, net) => net < 0 ? step + 1 : Math.max(1, step - 1) },
  /** Stakes follow 1, 1, 2, 3, 5, 8…: one step on after a loss, two back after a win. */
  FIBONACCI: { id: 'FIBONACCI', start: 0, bets: ({ unit, step }) => red(unit * fibonacci(step)), next: (step, net) => net < 0 ? step + 1 : Math.max(0, step - 2) },
  /** 20 units a round: 14 on 19–36, 5 on the 13–18 six line, 1 on zero. */
  JAMES_BOND: {
    id: 'JAMES_BOND',
    start: 0,
    bets: ({ unit }) => [
      { type: 'HIGH', amount: unit * 14 },
      { type: 'SIX_LINE', pockets: ['13', '14', '15', '16', '17', '18'], amount: unit * 5 },
      { type: 'STRAIGHT', pockets: ['0'], amount: unit }
    ],
    next: () => 0
  },
  /** Straight-up on the three numbers that came up most in the last 30 spins. */
  HOT_NUMBERS: {
    id: 'HOT_NUMBERS',
    start: 0,
    bets: ({ variant, unit, history, randomInt }) => {
      const counts = new Map<Pocket, number>()
      for (const pocket of history.slice(0, HOT_WINDOW)) counts.set(pocket, (counts.get(pocket) ?? 0) + 1)
      const chosen = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([pocket]) => pocket)
      const pockets = getVariant(variant).pockets
      while (chosen.length < 3) {
        const pocket = pockets[randomInt(pockets.length)]
        if (!chosen.includes(pocket)) chosen.push(pocket)
      }
      return chosen.map(pocket => ({ type: 'STRAIGHT', pockets: [pocket], amount: unit }))
    },
    next: () => 0
  }
}

/** The share of a stake the house keeps on average. */
export function betHouseEdge (variant: VariantName, bet: Bet): number {
  return 1 - (PAYOUTS[bet.type] + 1) * coveredPockets(variant, bet).length / getVariant(variant).pockets.length
}

export interface SessionOptions {
  strategy: StrategyId
  variant: VariantName
  bankroll: number
  unit: number
  rounds: number
  randomInt: RandomInt
  /** Spins before the session starts, newest first, so hot-number bets have something to go on. */
  history?: readonly Pocket[]
}

export interface SessionResult {
  /** Bankroll after each round, starting with the opening bankroll. */
  path: number[]
  final: number
  /** The round the bankroll could no longer cover the base bet, if it came to that. */
  bustRound: number | null
  roundsPlayed: number
  staked: number
  /** What the house edge predicts for these stakes (≤ 0). */
  expectedNet: number
  /** Rounds where the system called for more than the bankroll held and had to start over. */
  forcedResets: number
  biggestStake: number
}

/** Plays one session of a strategy until the rounds run out or the bankroll can't cover a base bet. */
export function simulateSession ({ strategy: id, variant, bankroll, unit, rounds, randomInt, history = [] }: SessionOptions): SessionResult {
  const strategy = STRATEGIES[id]
  const spins = [...history]
  const path = [bankroll]
  let balance = bankroll
  let step = strategy.start
  let staked = 0
  let expectedNet = 0
  let forcedResets = 0
  let biggestStake = 0
  let bustRound: number | null = null

  for (let round = 1; round <= rounds; round++) {
    const total = (bets: Bet[]) => bets.reduce((sum, bet) => sum + bet.amount, 0)
    let bets = strategy.bets({ variant, unit, step, history: spins, randomInt })
    if (total(bets) > balance) {
      // The progression has outrun the bankroll: start the system over, if even that is affordable.
      step = strategy.start
      bets = strategy.bets({ variant, unit, step, history: spins, randomInt })
      if (total(bets) > balance) { bustRound = round; break }
      forcedResets++
    }

    const pocket = spin(variant, randomInt)
    const { totalStake, totalPayout } = settle(variant, bets, pocket)
    const net = totalPayout - totalStake
    balance += net
    staked += totalStake
    biggestStake = Math.max(biggestStake, totalStake)
    expectedNet -= bets.reduce((sum, bet) => sum + bet.amount * betHouseEdge(variant, bet), 0)
    step = strategy.next(step, net)
    spins.unshift(pocket)
    if (spins.length > HOT_WINDOW) spins.length = HOT_WINDOW
    path.push(balance)
  }

  return { path, final: balance, bustRound, roundsPlayed: path.length - 1, staked, expectedNet, forcedResets, biggestStake }
}

export interface LabSummary {
  sessions: number
  bankroll: number
  /** Share of sessions that finished above the opening bankroll. */
  ahead: number
  busted: number
  medianFinal: number
  averageNet: number
  averageExpectedNet: number
  averageStaked: number
  bestFinal: number
  worstFinal: number
  /** Share of sessions where the system demanded more than the bankroll at least once. */
  hitTheWall: number
}

export function summarizeSessions (results: readonly SessionResult[], bankroll: number): LabSummary {
  const count = results.length || 1
  const finals = results.map(result => result.final).sort((a, b) => a - b)
  const mid = finals.length >> 1
  const average = (pick: (result: SessionResult) => number) => results.reduce((sum, result) => sum + pick(result), 0) / count
  return {
    sessions: results.length,
    bankroll,
    ahead: results.filter(result => result.final > bankroll).length / count,
    busted: results.filter(result => result.bustRound !== null).length / count,
    medianFinal: finals.length ? (finals.length % 2 ? finals[mid] : (finals[mid - 1] + finals[mid]) / 2) : bankroll,
    averageNet: average(result => result.final - bankroll),
    averageExpectedNet: average(result => result.expectedNet),
    averageStaked: average(result => result.staked),
    bestFinal: finals[finals.length - 1] ?? bankroll,
    worstFinal: finals[0] ?? bankroll,
    hitTheWall: results.filter(result => result.forcedResets > 0).length / count
  }
}
