import type {
  Bet, BetSelection, BetType, BetValidation, IndexedBetType, InsideBetType, Pocket,
  RandomInt, Settlement, VariantName
} from './types.ts'
import { tableLayout } from './layout.ts'
import { PAYOUTS, RED_POCKETS, getVariant, isPocket } from './variants.ts'

const INSIDE_TYPES: ReadonlySet<BetType> = new Set<InsideBetType>(['STRAIGHT', 'SPLIT', 'STREET', 'CORNER', 'SIX_LINE', 'TOP_LINE'])
const INDEXED_TYPES: ReadonlySet<BetType> = new Set<IndexedBetType>(['COLUMN', 'DOZEN'])

/** Largest stake whose payout (stake * 36) is still a safe integer. */
export const MAX_BET_AMOUNT = Math.floor(Number.MAX_SAFE_INTEGER / (PAYOUTS.STRAIGHT + 1))

const NUMBERS = Array.from({ length: 36 }, (_, i) => i + 1)

/** Pockets covered by every non-inside bet, keyed by type and index. */
function outsidePockets (type: BetType, index?: number): Pocket[] {
  const pick = (test: (value: number) => boolean) => NUMBERS.filter(test).map(String)
  switch (type) {
    case 'COLUMN': return pick(value => (value - 1) % 3 === (index as number) - 1)
    case 'DOZEN': return pick(value => Math.ceil(value / 12) === index)
    case 'RED': return pick(value => RED_POCKETS.has(String(value)))
    case 'BLACK': return pick(value => !RED_POCKETS.has(String(value)))
    case 'ODD': return pick(value => value % 2 === 1)
    case 'EVEN': return pick(value => value % 2 === 0)
    case 'LOW': return pick(value => value <= 18)
    case 'HIGH': return pick(value => value >= 19)
    default: throw new Error(`Not an outside bet: ${type}`)
  }
}

const insideKey = (type: BetType, pockets: readonly Pocket[]) => `${type}:${pockets.join(',')}`

const legalInside = new Map<VariantName, Map<string, Pocket[]>>()

function legalInsideBets (name: VariantName): Map<string, Pocket[]> {
  let bets = legalInside.get(name)
  if (!bets) {
    const order = getVariant(name).pockets
    bets = new Map()
    for (const spot of tableLayout(name).insideSpots) {
      const sorted = [...spot.pockets].sort((a, b) => order.indexOf(a) - order.indexOf(b))
      bets.set(insideKey(spot.type, sorted), sorted)
    }
    legalInside.set(name, bets)
  }
  return bets
}

/**
 * Checks a bet from any source (including untrusted client JSON) against the
 * variant's rules. On success returns the canonical bet and its covered pockets.
 */
export function validateBet (name: VariantName, input: unknown): BetValidation {
  const variant = getVariant(name)
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'InvalidBet' }
  const raw = input as Record<string, unknown>
  const type = raw.type as BetType

  if (typeof type !== 'string' || !Object.hasOwn(PAYOUTS, type)) return { ok: false, error: 'UnknownBetType' }
  if (!variant.allowedBetTypes.includes(type)) return { ok: false, error: 'BetTypeNotAllowed' }

  const amount = raw.amount
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_BET_AMOUNT) {
    return { ok: false, error: 'InvalidAmount' }
  }

  if (INSIDE_TYPES.has(type)) {
    const pockets = raw.pockets
    if (!Array.isArray(pockets) || !pockets.every(pocket => isPocket(name, pocket))) {
      return { ok: false, error: 'InvalidSelection' }
    }
    const sorted = [...pockets].sort((a, b) => variant.pockets.indexOf(a) - variant.pockets.indexOf(b))
    const covered = legalInsideBets(name).get(insideKey(type, sorted))
    if (!covered) return { ok: false, error: 'InvalidSelection' }
    return { ok: true, bet: { type: type as InsideBetType, pockets: [...covered], amount }, covered: [...covered] }
  }

  if (INDEXED_TYPES.has(type)) {
    const index = raw.index
    if (index !== 1 && index !== 2 && index !== 3) return { ok: false, error: 'InvalidSelection' }
    return { ok: true, bet: { type: type as IndexedBetType, index, amount }, covered: outsidePockets(type, index) }
  }

  return { ok: true, bet: { type, amount } as Bet, covered: outsidePockets(type) }
}

function requireValid (name: VariantName, input: unknown) {
  const result = validateBet(name, input)
  if (!result.ok) throw new Error(`Invalid ${name} bet (${result.error}): ${JSON.stringify(input)}`)
  return result
}

/** Pockets a bet selection wins on. Throws on an illegal selection. */
export function coveredPockets (name: VariantName, selection: BetSelection): Pocket[] {
  return requireValid(name, { ...selection, amount: 1 }).covered
}

/** Settles bets against the winning pocket. A win pays stake + stake * odds. */
export function settle (name: VariantName, bets: readonly Bet[], winningPocket: Pocket): Settlement {
  if (!isPocket(name, winningPocket)) throw new Error(`Pocket ${String(winningPocket)} is not on the ${name} wheel`)
  let totalStake = 0
  let totalPayout = 0
  const results = bets.map(input => {
    const { bet, covered } = requireValid(name, input)
    const won = covered.includes(winningPocket)
    const payout = won ? bet.amount * (PAYOUTS[bet.type] + 1) : 0
    totalStake += bet.amount
    totalPayout += payout
    return { bet, won, payout }
  })
  return { winningPocket, results, totalStake, totalPayout }
}

/** Picks the winning pocket. The engine has no randomness of its own. */
export function spin (name: VariantName, randomInt: RandomInt): Pocket {
  const pockets = getVariant(name).pockets
  const index = randomInt(pockets.length)
  if (!Number.isInteger(index) || index < 0 || index >= pockets.length) {
    throw new Error(`randomInt(${pockets.length}) returned ${index}`)
  }
  return pockets[index]
}
