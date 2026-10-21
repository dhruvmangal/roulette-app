import type { BotStyle, Seat, Settlement } from '@roulette/engine'
import { totalOf } from './game'
import { useI18n, type MessageKey } from './i18n'

const botLabel = (style: BotStyle) => `bot.${style}` as MessageKey

interface Props {
  seats: Seat[]
  me: string
  localPlayers: string[]
  /** This round's settlements once the ball has landed, otherwise null. */
  settlements: Record<string, Settlement> | null
  /** Balance to show for a seat, so payouts stay hidden while the ball rolls. */
  balanceOf: (seat: Seat) => number
  onSelect: (playerId: string) => void
}

export function Seats ({ seats, me, localPlayers, settlements, balanceOf, onSelect }: Props) {
  const { t, number } = useI18n()
  const canSwitch = localPlayers.length > 1
  return (
    <ul className="seats" aria-label={t('seats.aria')}>
      {seats.map(seat => {
        const local = localPlayers.includes(seat.playerId)
        const result = settlements?.[seat.playerId]
        const net = result && result.totalStake ? result.totalPayout - result.totalStake : null
        const stake = totalOf(seat.bets)
        // Other players' wallets are private online: their balance is unknown.
        const shown = balanceOf(seat)
        const balance = Number.isFinite(shown) ? number(shown) : '—'
        return (
          <li key={seat.playerId}>
            <button
              type="button"
              className={`seat seat-${seat.seat}${seat.playerId === me ? ' is-active' : ''}${seat.botStyle ? ' is-bot' : ''}`}
              disabled={!canSwitch || !local}
              aria-pressed={canSwitch && local ? seat.playerId === me : undefined}
              aria-label={`${seat.name}${seat.botStyle ? `, ${t('seats.computer')}, ${t(botLabel(seat.botStyle))}` : ''}${Number.isFinite(shown) ? `, ${t('seats.balance', { amount: shown })}` : ''}`}
              onClick={() => onSelect(seat.playerId)}
            >
              <i className="seat-dot" aria-hidden="true" />
              <span className="seat-name">{seat.name}</span>
              <span className="seat-meta">{seat.botStyle ? t(botLabel(seat.botStyle)) : t('seats.player')}</span>
              <span className="seat-balance">{balance}</span>
              <span className={`seat-round${net === null ? '' : net > 0 ? ' is-up' : net < 0 ? ' is-down' : ''}`}>
                {net !== null ? `${net > 0 ? '+' : net < 0 ? '−' : '±'}${number(Math.abs(net))}` : stake ? t('seats.bet', { amount: number(stake) }) : '—'}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
