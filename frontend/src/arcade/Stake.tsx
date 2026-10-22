import { ARCADE_LIMITS } from '@roulette/engine'
import { useI18n } from '../i18n'

const QUICK = [10, 50, 100, 500, 1000] as const

interface Props {
  label?: string
  value: number
  onChange: (stake: number) => void
  /** The most that can be staked: the balance, or less. */
  available: number
  disabled?: boolean
  /** Fewer quick amounts, for a narrow card. */
  compact?: boolean
}

/** Whether a stake can be placed right now. */
export const canStake = (stake: number, available: number) =>
  Number.isInteger(stake) && stake >= ARCADE_LIMITS.minBet && stake <= ARCADE_LIMITS.maxBet && stake <= available

/** How many chips to bet: the amount, halve and double, and casino chips for the usual sums. */
export function Stake ({ label, value, onChange, available, disabled, compact }: Props) {
  const { t, number } = useI18n()
  const error = value > available ? t('stake.error.balance') : value < ARCADE_LIMITS.minBet || value > ARCADE_LIMITS.maxBet ? t('stake.error.limits', { min: number(ARCADE_LIMITS.minBet), max: number(ARCADE_LIMITS.maxBet) }) : null
  const fit = (next: number) => onChange(Math.max(ARCADE_LIMITS.minBet, Math.min(ARCADE_LIMITS.maxBet, Math.floor(next))))
  const quick = compact ? QUICK.slice(0, 4) : QUICK
  return (
    <div className={`stake${compact ? ' is-compact' : ''}`}>
      <label className="stake-label" htmlFor={undefined}>
        <span className="dock-label">{label ?? t('stake.label')}</span>
        <span className="stake-field">
          <button type="button" className="stake-step" disabled={disabled} onClick={() => fit(value / 2)} aria-label={t('stake.half')}>÷2</button>
          <input
            type="number"
            inputMode="numeric"
            min={ARCADE_LIMITS.minBet}
            max={ARCADE_LIMITS.maxBet}
            step={ARCADE_LIMITS.minBet}
            value={Number.isFinite(value) ? value : ''}
            disabled={disabled}
            aria-invalid={error !== null}
            onChange={event => onChange(Math.floor(Number(event.target.value)) || 0)}
            onBlur={() => fit(value)}
          />
          <button type="button" className="stake-step" disabled={disabled} onClick={() => fit(value * 2)} aria-label={t('stake.double')}>×2</button>
        </span>
      </label>
      <div className="stake-chips" role="group" aria-label={t('stake.quick')}>
        {quick.map(amount => (
          <button key={amount} type="button" disabled={disabled || amount > available} className={`chip-token chip-${amount}${value === amount ? ' is-active' : ''}`} onClick={() => onChange(amount)} aria-pressed={value === amount}>
            <span>{amount >= 1000 ? `${amount / 1000}K` : amount}</span>
          </button>
        ))}
      </div>
      {error && <p className="stake-error" role="alert">{error}</p>}
    </div>
  )
}
