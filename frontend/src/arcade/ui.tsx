import type { ReactNode } from 'react'

/** A gold coin, for balances. */
export function Coin ({ size = 18 }: { size?: number }) {
  return (
    <svg className="coin" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="url(#coin-fill)" stroke="#7a5a1c" strokeWidth="1" />
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="#7a5a1c" strokeWidth="0.9" strokeDasharray="1.6 1.6" />
      <path d="M12 7.4v9.2M9.6 9.6c0-1 1-1.6 2.4-1.6s2.4.6 2.4 1.6-1 1.5-2.4 1.9-2.4.9-2.4 1.9 1 1.6 2.4 1.6 2.4-.6 2.4-1.6" fill="none" stroke="#6a4a12" strokeWidth="1.1" strokeLinecap="round" />
      <defs>
        <linearGradient id="coin-fill" x1="4" y1="3" x2="20" y2="21"><stop offset="0" stopColor="#fbe3a1" /><stop offset="0.5" stopColor="#e8c36a" /><stop offset="1" stopColor="#a97b2c" /></linearGradient>
      </defs>
    </svg>
  )
}

/** The last few results as small tokens, newest first. */
export function Recent ({ label, children }: { label: string, children: ReactNode }) {
  return <ul className="recent" aria-label={label}>{children}</ul>
}

export type Tone = 'win' | 'big' | 'even' | 'lose'

export interface Outcome {
  /** A new id plays the banner again. */
  id: number
  tone: Tone
  title: string
  detail: string
}

/** What came of a play: pops over the stage, holds a moment, then fades. */
export function ResultBanner ({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) return null
  return (
    <div key={outcome.id} className={`result-banner is-${outcome.tone}`} role="status">
      {(outcome.tone === 'win' || outcome.tone === 'big') && <i className="result-glow" aria-hidden="true" />}
      <strong>{outcome.title}</strong>
      <span>{outcome.detail}</span>
    </div>
  )
}

/** How a play ended, for the banner: more than the stake back is a win, a fifth-fold or more a big one. */
export const toneFor = (stake: number, payout: number): Tone => (payout >= stake * 5 ? 'big' : payout > stake ? 'win' : payout === stake ? 'even' : 'lose')

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: ReadonlyArray<{ value: T, label: string, tone?: 'low' | 'medium' | 'high' }>
  onChange: (value: T) => void
  disabled?: boolean
}

/** A row of exclusive choices, such as the risk level. */
export function Segmented<T extends string> ({ label, value, options, onChange, disabled }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(option => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} disabled={disabled} className={value === option.value ? 'is-active' : ''} onClick={() => onChange(option.value)}>
          {option.tone && <i className={`tone-dot is-${option.tone}`} aria-hidden="true" />}
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** An on/off switch with a label. */
export function Switch ({ checked, onChange, children, disabled }: { checked: boolean, onChange: (checked: boolean) => void, children: ReactNode, disabled?: boolean }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <i aria-hidden="true" />
      <span>{children}</span>
    </label>
  )
}

/** The line under a result: won more than the stake, got it back, got some back, or lost it. */
export function outcomeDetail (t: (key: 'result.win' | 'result.even' | 'result.back' | 'result.lose', vars?: Record<string, string | number>) => string, format: (value: number) => string, stake: number, payout: number): string {
  if (payout > stake) return t('result.win', { amount: format(payout) })
  if (payout === stake) return t('result.even', { amount: format(payout) })
  if (payout > 0) return t('result.back', { amount: format(payout), lost: format(stake - payout) })
  return t('result.lose', { amount: format(stake) })
}
