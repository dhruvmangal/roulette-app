import type { BetType, Pocket, PocketColor, VariantName } from './types.ts'

export interface Variant {
  name: VariantName
  /** Every pocket in canonical order: zeros first, then 1..36. */
  pockets: readonly Pocket[]
  /** Physical clockwise sequence on the wheel, for animation. */
  wheelOrder: readonly Pocket[]
  zeros: readonly Pocket[]
  allowedBetTypes: readonly BetType[]
}

/** N:1 odds. A winning bet returns stake * (odds + 1). */
export const PAYOUTS: Readonly<Record<BetType, number>> = {
  STRAIGHT: 35,
  SPLIT: 17,
  STREET: 11,
  CORNER: 8,
  SIX_LINE: 5,
  TOP_LINE: 6,
  COLUMN: 2,
  DOZEN: 2,
  RED: 1,
  BLACK: 1,
  ODD: 1,
  EVEN: 1,
  LOW: 1,
  HIGH: 1
}

export const RED_POCKETS: ReadonlySet<Pocket> = new Set(
  [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].map(String)
)

const NUMBERS: Pocket[] = Array.from({ length: 36 }, (_, i) => String(i + 1))

const COMMON_BET_TYPES: BetType[] = [
  'STRAIGHT', 'SPLIT', 'STREET', 'CORNER', 'SIX_LINE',
  'COLUMN', 'DOZEN', 'RED', 'BLACK', 'ODD', 'EVEN', 'LOW', 'HIGH'
]

export const VARIANTS: Readonly<Record<VariantName, Variant>> = {
  ENGLISH: {
    name: 'ENGLISH',
    pockets: ['0', ...NUMBERS],
    wheelOrder: [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26].map(String),
    zeros: ['0'],
    allowedBetTypes: COMMON_BET_TYPES
  },
  AMERICAN: {
    name: 'AMERICAN',
    pockets: ['0', '00', ...NUMBERS],
    wheelOrder: ['0', '28', '9', '26', '30', '11', '7', '20', '32', '17', '5', '22', '34', '15', '3', '24', '36', '13', '1', '00', '27', '10', '25', '29', '12', '8', '19', '31', '18', '6', '21', '33', '16', '4', '23', '35', '14', '2'],
    zeros: ['0', '00'],
    allowedBetTypes: [...COMMON_BET_TYPES, 'TOP_LINE']
  }
}

export function getVariant (name: VariantName): Variant {
  const variant = VARIANTS[name]
  if (!variant) throw new Error(`Unknown roulette variant: ${String(name)}`)
  return variant
}

export function isPocket (name: VariantName, value: unknown): value is Pocket {
  return typeof value === 'string' && getVariant(name).pockets.includes(value)
}

export function pocketColor (pocket: Pocket): PocketColor {
  if (pocket === '0' || pocket === '00') return 'green'
  return RED_POCKETS.has(pocket) ? 'red' : 'black'
}

/** Index of a pocket in the physical wheel order, for rotating the wheel to it. */
export function wheelIndex (name: VariantName, pocket: Pocket): number {
  const index = getVariant(name).wheelOrder.indexOf(pocket)
  if (index === -1) throw new Error(`Pocket ${pocket} is not on the ${name} wheel`)
  return index
}

/** The pocket plus `count` physical neighbours on each side (racetrack bets). */
export function neighbors (name: VariantName, pocket: Pocket, count: number): Pocket[] {
  const order = getVariant(name).wheelOrder
  const center = wheelIndex(name, pocket)
  const result: Pocket[] = []
  for (let offset = -count; offset <= count; offset++) {
    result.push(order[(center + offset + order.length * (count + 1)) % order.length])
  }
  return result
}
