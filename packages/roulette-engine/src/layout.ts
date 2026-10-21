import type { EvenMoneyBetType, IndexedBetType, InsideBetType, Pocket, PocketColor, VariantName } from './types.ts'
import { getVariant, pocketColor } from './variants.ts'

/**
 * Table geometry in grid units. Numbers occupy x 0..12, y 0..3 with the
 * 3-6-9 row on top (y = 0). Zeros sit at x -1..0, column bets at x 12..13,
 * dozens at y 3..4 and even-money bets at y 4..5.
 */
export interface Rect { x: number, y: number, width: number, height: number }

export interface PocketCell extends Rect { pocket: Pocket, color: PocketColor }

/** A legal inside bet and the point on the felt where its chip sits. */
export interface InsideSpot { type: InsideBetType, pockets: Pocket[], x: number, y: number }

export type OutsideArea = Rect & (
  | { type: IndexedBetType, index: 1 | 2 | 3, label: string }
  | { type: EvenMoneyBetType, label: string }
)

export interface TableLayout {
  variant: VariantName
  bounds: Rect
  cells: PocketCell[]
  insideSpots: InsideSpot[]
  outsideAreas: OutsideArea[]
}

const n = (value: number): Pocket => String(value)

/** Column 1..12 (a street) and row position 0..2 (0 = the 1-4-7 row) of a number. */
const columnOf = (value: number) => Math.ceil(value / 3)
const positionOf = (value: number) => (value - 1) % 3
const topOf = (value: number) => 2 - positionOf(value)

function zeroGeometry (name: VariantName): { cells: Rect[], spots: InsideSpot[] } {
  if (name === 'ENGLISH') {
    return {
      cells: [{ x: -1, y: 0, width: 1, height: 3 }],
      spots: [
        { type: 'STRAIGHT', pockets: ['0'], x: -0.5, y: 1.5 },
        { type: 'SPLIT', pockets: ['0', '1'], x: 0, y: 2.5 },
        { type: 'SPLIT', pockets: ['0', '2'], x: 0, y: 1.5 },
        { type: 'SPLIT', pockets: ['0', '3'], x: 0, y: 0.5 },
        { type: 'STREET', pockets: ['0', '1', '2'], x: 0, y: 2 },
        { type: 'STREET', pockets: ['0', '2', '3'], x: 0, y: 1 },
        { type: 'CORNER', pockets: ['0', '1', '2', '3'], x: 0, y: 3 }
      ]
    }
  }
  // American: 00 above (next to 3), 0 below (next to 1).
  return {
    cells: [
      { x: -1, y: 1.5, width: 1, height: 1.5 },
      { x: -1, y: 0, width: 1, height: 1.5 }
    ],
    spots: [
      { type: 'STRAIGHT', pockets: ['0'], x: -0.5, y: 2.25 },
      { type: 'STRAIGHT', pockets: ['00'], x: -0.5, y: 0.75 },
      { type: 'SPLIT', pockets: ['0', '00'], x: -0.5, y: 1.5 },
      { type: 'SPLIT', pockets: ['0', '1'], x: 0, y: 2.5 },
      { type: 'SPLIT', pockets: ['0', '2'], x: 0, y: 1.75 },
      { type: 'SPLIT', pockets: ['00', '2'], x: 0, y: 1.25 },
      { type: 'SPLIT', pockets: ['00', '3'], x: 0, y: 0.5 },
      { type: 'STREET', pockets: ['0', '1', '2'], x: 0, y: 2 },
      { type: 'STREET', pockets: ['00', '2', '3'], x: 0, y: 1 },
      { type: 'TOP_LINE', pockets: ['0', '00', '1', '2', '3'], x: 0, y: 3 }
    ]
  }
}

function buildLayout (name: VariantName): TableLayout {
  const variant = getVariant(name)
  const zero = zeroGeometry(name)
  const cells: PocketCell[] = variant.zeros.map((pocket, i) => ({ pocket, color: 'green', ...zero.cells[i] }))
  const spots: InsideSpot[] = [...zero.spots]

  for (let value = 1; value <= 36; value++) {
    const column = columnOf(value)
    const position = positionOf(value)
    const top = topOf(value)
    cells.push({ pocket: n(value), color: pocketColor(n(value)), x: column - 1, y: top, width: 1, height: 1 })
    spots.push({ type: 'STRAIGHT', pockets: [n(value)], x: column - 0.5, y: top + 0.5 })
    if (value <= 33) spots.push({ type: 'SPLIT', pockets: [n(value), n(value + 3)], x: column, y: top + 0.5 })
    if (position < 2) spots.push({ type: 'SPLIT', pockets: [n(value), n(value + 1)], x: column - 0.5, y: top })
    if (position < 2 && value <= 32) {
      spots.push({ type: 'CORNER', pockets: [n(value), n(value + 1), n(value + 3), n(value + 4)], x: column, y: top })
    }
  }

  for (let column = 1; column <= 12; column++) {
    const first = column * 3 - 2
    spots.push({ type: 'STREET', pockets: [n(first), n(first + 1), n(first + 2)], x: column - 0.5, y: 3 })
    if (column < 12) {
      spots.push({
        type: 'SIX_LINE',
        pockets: [first, first + 1, first + 2, first + 3, first + 4, first + 5].map(n),
        x: column,
        y: 3
      })
    }
  }

  const ordinals = ['1st', '2nd', '3rd']
  const outsideAreas: OutsideArea[] = []
  for (const index of [1, 2, 3] as const) {
    outsideAreas.push({ type: 'COLUMN', index, label: '2 to 1', x: 12, y: 3 - index, width: 1, height: 1 })
    outsideAreas.push({ type: 'DOZEN', index, label: `${ordinals[index - 1]} 12`, x: (index - 1) * 4, y: 3, width: 4, height: 1 })
  }
  const evenMoney: [EvenMoneyBetType, string][] = [
    ['LOW', '1-18'], ['EVEN', 'Even'], ['RED', 'Red'], ['BLACK', 'Black'], ['ODD', 'Odd'], ['HIGH', '19-36']
  ]
  evenMoney.forEach(([type, label], i) => {
    outsideAreas.push({ type, label, x: i * 2, y: 4, width: 2, height: 1 })
  })

  return { variant: name, bounds: { x: -1, y: 0, width: 14, height: 5 }, cells, insideSpots: spots, outsideAreas }
}

const layouts = new Map<VariantName, TableLayout>()

export function tableLayout (name: VariantName): TableLayout {
  let layout = layouts.get(name)
  if (!layout) {
    layout = buildLayout(name)
    layouts.set(name, layout)
  }
  return layout
}
