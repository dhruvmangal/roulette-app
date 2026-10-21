import { pocketColor, type Bet, type BetSelection, type Pocket } from '@roulette/engine'
import { translate, type MessageKey } from './i18n'

export const CHIPS = [1, 5, 25, 100, 500] as const

/** Stable identity for a bet position on the felt, ignoring the amount. */
export function betKey (bet: BetSelection): string {
  if ('pockets' in bet) return `${bet.type}:${bet.pockets.join(',')}`
  if ('index' in bet) return `${bet.type}:${bet.index}`
  return bet.type
}

export function betLabel (bet: BetSelection): string {
  const name = translate(`bet.${bet.type}`)
  switch (bet.type) {
    case 'STRAIGHT': return `${name} ${bet.pockets[0]}`
    case 'SPLIT': return `${name} ${bet.pockets.join('/')}`
    case 'STREET': return `${name} ${bet.pockets.join('-')}`
    case 'CORNER': return `${name} ${bet.pockets.join('-')}`
    case 'SIX_LINE': return `${name} ${bet.pockets[0]}-${bet.pockets[5]}`
    case 'COLUMN': return `${name} ${bet.index}`
    case 'DOZEN': return translate('bet.dozenOrdinal', { ordinal: translate(`ordinal.${bet.index}` as MessageKey) })
    default: return name
  }
}

/** Facts about a pocket shown on the result reveal, e.g. RED · ODD · 2ND DOZEN. */
export function pocketTraits (pocket: Pocket): string[] {
  if (pocket === '0') return [translate('dealer.zero').replace(/\.$/, '').toUpperCase()]
  if (pocket === '00') return [translate('dealer.doubleZero').replace(/\.$/, '').toUpperCase()]
  const value = Number(pocket)
  return [
    translate(`color.${pocketColor(pocket)}`).toUpperCase(),
    translate(value % 2 === 0 ? 'parity.even' : 'parity.odd').toUpperCase(),
    translate(value <= 18 ? 'bet.LOW' : 'bet.HIGH'),
    translate('bet.dozenOrdinal', { ordinal: translate(`ordinal.${Math.ceil(value / 12)}` as MessageKey) }).toUpperCase()
  ]
}

/** Unbiased integer in [0, max) from the browser's CSPRNG. */
export function secureRandomInt (max: number): number {
  const limit = Math.floor(0x100000000 / max) * max
  const buffer = new Uint32Array(1)
  do crypto.getRandomValues(buffer)
  while (buffer[0] >= limit)
  return buffer[0] % max
}

export const totalOf = (bets: readonly Bet[]) => bets.reduce((sum, bet) => sum + bet.amount, 0)
