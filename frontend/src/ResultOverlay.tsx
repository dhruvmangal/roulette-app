import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { pocketColor, type Settlement } from '@roulette/engine'
import { betLabel, pocketTraits } from './game'
import { useI18n, type MessageKey } from './i18n'

interface Props {
  settlement: Settlement
  onClose: () => void
  /** Whose result this is, when several people share the device. */
  playerName?: string
}

function useCountUp (target: number, duration = 1400) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      setValue(Math.round(target * (1 - (1 - t) ** 3)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])
  return value
}

export function ResultOverlay ({ settlement, onClose, playerName }: Props) {
  const { t, number } = useI18n()
  const { winningPocket, totalStake, totalPayout, results } = settlement
  const net = totalPayout - totalStake
  const won = net > 0
  const big = won && totalPayout >= totalStake * 8
  const color = pocketColor(winningPocket)
  const shown = useCountUp(Math.abs(net))
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const confetti = useMemo(() => won
    ? Array.from({ length: big ? 140 : 70 }, (_, i) => ({
        key: i,
        style: {
          '--x': `${Math.random() * 100}vw`,
          '--drift': `${(Math.random() - 0.5) * 30}vw`,
          '--spin': `${(Math.random() - 0.5) * 1440}deg`,
          '--delay': `${Math.random() * 0.9}s`,
          '--fall': `${2.4 + Math.random() * 2}s`,
          '--hue': ['#f3cf6e', '#fff4d6', '#c8283c', '#e6b54a'][i % 4]
        } as CSSProperties
      }))
    : [], [won, big])

  const title = big ? t('result.magnificent') : won ? (playerName && playerName !== 'You' ? t('result.playerWins', { name: playerName }) : t('result.youWin')) : net === 0 ? t('result.stakeReturned') : totalPayout > 0 ? t('result.soClose') : t('result.houseTakes')
  const winners = results.filter(result => result.won).sort((a, b) => b.payout - a.payout).slice(0, 4)

  return (
    <div className={`result-overlay result-${color}${won ? ' is-win' : ' is-loss'}${big ? ' is-big' : ''}`} role="dialog" aria-modal="true" aria-labelledby="result-title" onClick={onClose}>
      <div className="result-rays" aria-hidden="true" />
      {confetti.map(piece => <i key={piece.key} className="confetti" style={piece.style} aria-hidden="true" />)}
      <section className="result-card" onClick={event => event.stopPropagation()}>
        <p className="result-eyebrow">{playerName ? t('result.eyebrowPlayer', { name: playerName }) : t('result.eyebrow')}</p>
        <div className="medallion" aria-label={t('result.medallion', { pocket: winningPocket, color: t(`color.${color}` as MessageKey) })}>
          <span className="medallion-ring" aria-hidden="true" />
          <strong>{winningPocket}</strong>
        </div>
        <p className="result-traits">{pocketTraits(winningPocket).join('  ·  ')}</p>
        <h2 id="result-title" className="result-title">{title}</h2>
        <p className="result-amount">
          {net > 0 ? '+' : net < 0 ? '−' : '±'}{number(shown)} <small>{t('result.chips')}</small>
        </p>
        <p className="result-sub">
          {totalPayout > 0
            ? t('result.stakedReturned', { staked: number(totalStake), returned: number(totalPayout) })
            : t('result.stakedLuck', { staked: number(totalStake) })}
        </p>
        {winners.length > 0 && (
          <ul className="result-winners">
            {winners.map((result, i) => (
              <li key={i}><span>{betLabel(result.bet)}</span><b>+{number(result.payout)}</b></li>
            ))}
          </ul>
        )}
        <button ref={closeRef} type="button" className="btn-gold result-next" onClick={onClose}>{t('result.next')}</button>
      </section>
    </div>
  )
}
