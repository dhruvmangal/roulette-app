import { tableLayout } from './layout.ts'
import type { Bet, BetSelection, EvenMoneyBetType, Pocket, RandomInt, Settlement, VariantName } from './types.ts'
import { getVariant } from './variants.ts'

export type BotStyle = 'CAUTIOUS' | 'MARTINGALE' | 'RANDOM' | 'NUMBER_CHASER'

export interface BotContext {
  variant: VariantName
  balance: number
  /** Winning pockets, newest first. */
  history: readonly Pocket[]
  /** This bot's own settlement from the previous round, if it played. */
  last: Settlement | null
  randomInt: RandomInt
}

/** Picks a bot's bets for one round. Strategies are pure, so the server can run the same bots. */
export type BotStrategy = (context: BotContext) => Bet[]

const UNITS = [100, 25, 5, 1]
const EVEN_MONEY: EvenMoneyBetType[] = ['RED', 'BLACK', 'ODD', 'EVEN', 'LOW', 'HIGH']
const CHASE_WINDOW = 20

/** A chip-sized base stake of about 1/40th of the balance. */
export function baseUnit (balance: number): number {
  return UNITS.find(unit => unit * 40 <= balance) ?? 1
}

const pick = <T>(items: readonly T[], randomInt: RandomInt): T => items[randomInt(items.length)]

/** Drops bets from the end until the total fits the balance. */
function affordable (bets: Bet[], balance: number): Bet[] {
  const kept: Bet[] = []
  let total = 0
  for (const bet of bets) {
    if (total + bet.amount > balance) break
    kept.push(bet)
    total += bet.amount
  }
  return kept
}

const cautious: BotStrategy = ({ balance, randomInt }) => {
  const unit = baseUnit(balance)
  const bets: Bet[] = [{ type: pick(EVEN_MONEY, randomInt), amount: unit }]
  if (randomInt(4) === 0) bets.push({ type: 'DOZEN', index: (randomInt(3) + 1) as 1 | 2 | 3, amount: unit })
  return affordable(bets, balance)
}

/** Always red; doubles the stake after a loss and starts over after a win or when it can't cover. */
const martingale: BotStrategy = ({ balance, last }) => {
  const unit = baseUnit(balance)
  const lost = last !== null && last.totalStake > 0 && last.totalPayout === 0
  const doubled = lost ? last.totalStake * 2 : unit
  return affordable([{ type: 'RED', amount: doubled <= balance ? doubled : unit }], balance)
}

const random: BotStrategy = ({ variant, balance, randomInt }) => {
  const layout = tableLayout(variant)
  const spots: BetSelection[] = [
    ...layout.insideSpots.map(({ type, pockets }) => ({ type, pockets }) as BetSelection),
    ...layout.outsideAreas.map(area => ('index' in area ? { type: area.type, index: area.index } : { type: area.type }) as BetSelection)
  ]
  const unit = baseUnit(balance)
  return affordable(Array.from({ length: randomInt(3) + 1 }, () => ({ ...pick(spots, randomInt), amount: unit }) as Bet), balance)
}

/** Backs the numbers that came up most often lately, topping up with random ones. */
const numberChaser: BotStrategy = ({ variant, balance, history, randomInt }) => {
  const counts = new Map<Pocket, number>()
  for (const pocket of history.slice(0, CHASE_WINDOW)) counts.set(pocket, (counts.get(pocket) ?? 0) + 1)
  const wanted = randomInt(2) + 2
  const chosen = [...counts].sort((a, b) => b[1] - a[1]).slice(0, wanted).map(([pocket]) => pocket)
  const pockets = getVariant(variant).pockets
  while (chosen.length < wanted) {
    const pocket = pick(pockets, randomInt)
    if (!chosen.includes(pocket)) chosen.push(pocket)
  }
  const unit = baseUnit(balance)
  return affordable(chosen.map(pocket => ({ type: 'STRAIGHT', pockets: [pocket], amount: unit })), balance)
}

export const BOT_STRATEGIES: Readonly<Record<BotStyle, BotStrategy>> = {
  CAUTIOUS: cautious,
  MARTINGALE: martingale,
  RANDOM: random,
  NUMBER_CHASER: numberChaser
}

export const BOT_STYLES = Object.keys(BOT_STRATEGIES) as BotStyle[]

export const BOT_NAMES = ['Marcel', 'Ines', 'Viktor', 'Sofia', 'Kenji', 'Amara', 'Lucien', 'Noor'] as const
