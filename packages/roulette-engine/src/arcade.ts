import type { RandomInt } from './types.ts'

/**
 * The arcade games (crash, aviator, plinko, prize wheel, horse race): the odds
 * and the draws, as pure functions of a RandomInt. The server settles real
 * rounds with them and offline practice plays the same maths on the device.
 */

export type ArcadeGame = 'AVIATOR' | 'PLINKO' | 'WHEEL' | 'HORSES'
export const ARCADE_GAMES: readonly ArcadeGame[] = ['AVIATOR', 'PLINKO', 'WHEEL', 'HORSES']
/** The game played as a flight with a cash-out button. */
export type CrashGame = 'AVIATOR'

export type ArcadeRisk = 'low' | 'medium' | 'high'
export const ARCADE_RISKS: readonly ArcadeRisk[] = ['low', 'medium', 'high']

export const ARCADE_LIMITS = { minBet: 10, maxBet: 10_000 } as const

/** What a game gives back on average, per chip staked. */
export const ARCADE_RTP = 0.985

/** Chips paid for a stake at a multiplier. Rounded down, so the house never pays a fraction. */
export const arcadePayout = (stake: number, multiplier: number): number => Math.floor(stake * multiplier + 1e-9)

const GRID = 2 ** 30
/** A uniform number in [0, 1). */
const unit = (randomInt: RandomInt): number => randomInt(GRID) / GRID

// ─── Crash and Aviator ───────────────────────────────────────────────

/** The multiplier is exp(rate × ms): 2x after 8.7s, 10x after 29s, 100x after 58s. */
export const CRASH_RATE = 0.00008
export const CRASH_MAX_MULTIPLIER = 1000
export const CRASH_EDGE = 0.01
/** Aviator lets a player fly two bets at once. */
export const CRASH_SLOTS: Record<CrashGame, number> = { AVIATOR: 2 }

const floor2 = (value: number) => Math.floor(value * 100 + 1e-9) / 100

/** Where the flight ends: at least 1.00 (about 2% end right there). The chance of reaching any x from 1.01 up is 0.99 / x. */
export function crashPoint (randomInt: RandomInt): number {
  const u = unit(randomInt)
  return Math.min(CRASH_MAX_MULTIPLIER, Math.max(1, floor2((1 - CRASH_EDGE) / (1 - u))))
}

/** The multiplier on display after `elapsedMs` of flight. */
export const multiplierAt = (elapsedMs: number): number => floor2(Math.exp(CRASH_RATE * Math.max(0, elapsedMs)))

/** How long into the flight the display first shows `multiplier`. */
export const timeToMultiplier = (multiplier: number): number => Math.ceil(Math.log(multiplier) / CRASH_RATE)

export type CrashStatus =
  | { state: 'flying', multiplier: number }
  | { state: 'cashed', multiplier: number }
  | { state: 'crashed', multiplier: number }

/**
 * Where a bet stands `elapsedMs` into a flight that ends at `point`. A bet with an auto
 * cash-out at or below the point is cashed there; anything still flying when the display
 * reaches the point is lost. Cashing out by hand is `status.state === 'flying'` at the
 * moment the request is handled.
 */
export function crashStatus (point: number, autoCashout: number | null, elapsedMs: number): CrashStatus {
  if (autoCashout !== null && autoCashout <= point && elapsedMs >= timeToMultiplier(autoCashout)) {
    return { state: 'cashed', multiplier: autoCashout }
  }
  if (elapsedMs >= timeToMultiplier(point)) return { state: 'crashed', multiplier: point }
  return { state: 'flying', multiplier: multiplierAt(elapsedMs) }
}

export interface CrashBet {
  slot: number
  stake: number
  autoCashout: number | null
  state: 'ACTIVE' | 'CASHED' | 'CRASHED'
  /** Where the bet was cashed or crashed; set once it has settled. */
  multiplier?: number
  payout?: number
}

/**
 * Applies the clock to the bets of a flight in the air. A bet whose auto cash-out has been reached
 * is cashed there; one the flight has outrun is lost; and the bet in `cashNowSlot` (its owner pressed
 * the button) is cashed at the multiplier now, if the flight is still going. Returns the new bets,
 * the ones this call settled, and whether the flight is over.
 */
export function resolveCrashBets (
  flight: { crashPoint: number, bets: readonly CrashBet[] },
  elapsedMs: number,
  cashNowSlot: number | null = null
): { bets: CrashBet[], settled: CrashBet[], over: boolean } {
  const settled: CrashBet[] = []
  const bets = flight.bets.map((bet): CrashBet => {
    if (bet.state !== 'ACTIVE') return bet
    const status = crashStatus(flight.crashPoint, bet.autoCashout, elapsedMs)
    if (status.state === 'flying' && bet.slot !== cashNowSlot) return bet
    const cashed = status.state !== 'crashed'
    const done: CrashBet = { ...bet, state: cashed ? 'CASHED' : 'CRASHED', multiplier: status.multiplier, payout: cashed ? arcadePayout(bet.stake, status.multiplier) : 0 }
    settled.push(done)
    return done
  })
  return { bets, settled, over: bets.every(bet => bet.state !== 'ACTIVE') }
}

// ─── Plinko ──────────────────────────────────────────────────────────

export const PLINKO_ROWS = { min: 8, max: 16 } as const

// Each risk shapes the same bell curve differently: how much the edges pay
// against how little the middle does.
const PLINKO_SHAPE: Record<ArcadeRisk, { power: number, floor: number }> = {
  low: { power: 3, floor: 0.8 },
  medium: { power: 5, floor: 0.06 },
  high: { power: 9, floor: 0.004 }
}

const choose = (n: number, k: number) => {
  let result = 1
  for (let i = 1; i <= k; i++) result = result * (n - k + i) / i
  return result
}

/** The chance of the ball landing in each of the rows + 1 slots. */
export const plinkoOdds = (rows: number): number[] =>
  Array.from({ length: rows + 1 }, (_, slot) => choose(rows, slot) / 2 ** rows)

const plinkoTables = new Map<string, number[]>()

/** What each slot pays, left to right; the same for the mirrored slot. */
export function plinkoMultipliers (rows: number, risk: ArcadeRisk): readonly number[] {
  const key = `${rows}:${risk}`
  let table = plinkoTables.get(key)
  if (!table) {
    const { power, floor } = PLINKO_SHAPE[risk]
    const odds = plinkoOdds(rows)
    const weights = odds.map((_, slot) => floor + (Math.abs(slot - rows / 2) / (rows / 2)) ** power)
    const scale = ARCADE_RTP / odds.reduce((sum, p, slot) => sum + p * weights[slot], 0)
    table = weights.map(weight => Math.round(weight * scale * 100) / 100)
    plinkoTables.set(key, table)
  }
  return table
}

export interface PlinkoDrop {
  /** One entry per row: 0 for left, 1 for right. */
  path: number[]
  /** The slot the ball ends in, 0 at the far left. */
  slot: number
  multiplier: number
}

export function plinkoDrop (rows: number, risk: ArcadeRisk, randomInt: RandomInt): PlinkoDrop {
  if (!Number.isInteger(rows) || rows < PLINKO_ROWS.min || rows > PLINKO_ROWS.max) throw new Error(`Plinko has ${PLINKO_ROWS.min} to ${PLINKO_ROWS.max} rows, not ${rows}`)
  const path = Array.from({ length: rows }, () => randomInt(2))
  const slot = path.reduce((sum, step) => sum + step, 0)
  return { path, slot, multiplier: plinkoMultipliers(rows, risk)[slot] }
}

// ─── Prize wheel ─────────────────────────────────────────────────────

// Twenty slices a spin; each risk is a different mix of the same twenty, worth 19.6 in all (98%).
// Listed in the order they sit around the wheel, so the big ones are spread out.
export const WHEEL_SEGMENTS: Record<ArcadeRisk, readonly number[]> = {
  low: [1.2, 0.4, 1.5, 1.2, 0.6, 1.2, 1.5, 0.4, 1.2, 0.6, 1.5, 1.2, 0.4, 1.2, 0.6, 1.5, 1.2, 0.4, 0.6, 1.2],
  medium: [0, 1.5, 0, 2, 0.5, 0, 1.5, 4, 0, 2, 1.5, 0, 0.6, 1.5, 0, 2, 0.5, 1.5, 0, 0.5],
  high: [0, 0, 10, 0, 0.2, 0, 0, 2, 0, 0, 0.2, 0, 5, 0, 0, 2, 0.2, 0, 0, 0]
}

export interface WheelSpin {
  /** Which slice the pointer stops on. */
  segment: number
  multiplier: number
}

export function wheelSpin (risk: ArcadeRisk, randomInt: RandomInt): WheelSpin {
  const segments = WHEEL_SEGMENTS[risk]
  const segment = randomInt(segments.length)
  return { segment, multiplier: segments[segment] }
}

// ─── Horse race ──────────────────────────────────────────────────────

export interface Horse {
  name: string
  /** The chance of winning. */
  chance: number
  /** Pays this many chips per chip staked on a win, the stake included. */
  odds: number
}

const HORSE_FORM: ReadonlyArray<readonly [string, number]> = [
  ['Midnight Ace', 0.3],
  ['Gold Rush', 0.24],
  ['Velvet Storm', 0.18],
  ['Lucky Seven', 0.12],
  ['Red Baron', 0.09],
  ['Long Shot', 0.07]
]

export const HORSES: readonly Horse[] = HORSE_FORM.map(([name, chance]) => ({
  name,
  chance,
  odds: Math.floor(ARCADE_RTP * 100 / chance) / 100
}))

export interface HorseRace {
  /** Horse numbers (0-based) in the order they cross the line. */
  order: number[]
  /** Seeds the pictures of the race (pace changes); it has no say in the result. */
  seed: number
}

/** The winner is drawn by each horse's chance, then the runners-up the same way from those left. */
export function horseRace (randomInt: RandomInt): HorseRace {
  const left = HORSES.map((_, index) => index)
  const order: number[] = []
  while (left.length) {
    const total = left.reduce((sum, horse) => sum + HORSES[horse].chance, 0)
    let draw = unit(randomInt) * total
    let pick = left.length - 1
    for (const [position, horse] of left.entries()) {
      draw -= HORSES[horse].chance
      if (draw < 0) { pick = position; break }
    }
    order.push(left.splice(pick, 1)[0])
  }
  return { order, seed: randomInt(GRID) }
}

export interface HorseBet {
  horse: number
  stake: number
}

/** What the bets on a finished race pay in all. */
export const horsePayout = (bets: readonly HorseBet[], race: HorseRace): number =>
  bets.reduce((sum, bet) => sum + (race.order[0] === bet.horse ? arcadePayout(bet.stake, HORSES[bet.horse].odds) : 0), 0)
