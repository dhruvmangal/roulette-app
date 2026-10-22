import { useEffect, useMemo, useRef, useState } from 'react'
import { ARCADE_LIMITS, ARCADE_RISKS, WHEEL_SEGMENTS, type ArcadeRisk } from '@roulette/engine'
import { playCashOut, playCrash, playTick } from '../audio'
import { useI18n, type MessageKey } from '../i18n'
import { winFeedback } from '../native'
import { errorMessage } from '../session'
import { Stake, canStake } from './Stake'
import { Recent, ResultBanner, Segmented, toneFor, type Outcome, outcomeDetail } from './ui'
import { WheelScene, wheelHex } from './scenes/WheelScene'
import type { Arcade } from './useArcade'

const SPIN_MS = 4600
const REDUCED_MS = 700
const RECENT_SHOWN = 12

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function WheelGame ({ arcade }: { arcade: Arcade }) {
  const { t, number } = useI18n()
  const { backend, balance, take, give, settle } = arcade

  const [stake, setStake] = useState(100)
  const [risk, setRisk] = useState<ArcadeRisk>('medium')
  const [spinning, setSpinning] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<number[]>([])
  const timers = useRef<number[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<WheelScene | null>(null)

  const segments = WHEEL_SEGMENTS[risk]
  const legend = useMemo(() => {
    const counts = new Map<number, number>()
    for (const multiplier of segments) counts.set(multiplier, (counts.get(multiplier) ?? 0) + 1)
    return [...counts].sort((a, b) => b[0] - a[0])
  }, [segments])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    try { sceneRef.current = new WheelScene(wrap) } catch { return }
    return () => { sceneRef.current?.dispose(); sceneRef.current = null }
  }, [])
  useEffect(() => { sceneRef.current?.setSegments(segments) }, [segments])

  useEffect(() => {
    backend.history('WHEEL')
      .then(rounds => setRecent(rounds.flatMap(round => (round.game === 'WHEEL' ? [round.outcome.multiplier] : [])).slice(0, RECENT_SHOWN)))
      .catch(() => {})
    return () => timers.current.forEach(window.clearTimeout)
  }, [backend])

  async function spin () {
    setError(null)
    setOutcome(null)
    setSpinning(true)
    take(stake)
    try {
      const played = await backend.wheel({ stake, risk })
      const { segment } = played.round.outcome
      const count = WHEEL_SEGMENTS[played.round.outcome.risk].length
      const width = 360 / count
      // Whole turns plus the angle that brings the slice under the pointer, anywhere inside the slice.
      const jitter = (Math.random() - 0.5) * width * 0.6
      const target = Math.ceil((sceneRef.current?.degrees ?? 0) / 360) * 360 + 360 * 5 + ((360 - segment * width) % 360) + jitter
      const ms = prefersReducedMotion() ? REDUCED_MS : SPIN_MS
      // Ticks slow down with the wheel.
      for (let tick = 0; tick < 16 && ms === SPIN_MS; tick++) {
        timers.current.push(window.setTimeout(() => playTick(1 + (tick % 2) * 0.15), SPIN_MS * (1 - (1 - tick / 16) ** 2.4) * 0.97))
      }
      const reveal = () => {
        give(played.round.payout)
        settle(played.balance)
        setOutcome({
          id: played.round.arcadeRoundId,
          tone: toneFor(played.round.stake, played.round.payout),
          title: `${played.round.outcome.multiplier}×`,
          detail: outcomeDetail(t, number, played.round.stake, played.round.payout)
        })
        setRecent(current => [played.round.outcome.multiplier, ...current].slice(0, RECENT_SHOWN))
        if (played.round.payout > played.round.stake) { playCashOut(); winFeedback(played.round.outcome.multiplier >= 5) } else if (played.round.payout === 0) playCrash()
        setSpinning(false)
      }
      if (sceneRef.current) sceneRef.current.spinTo(target, ms, reveal)
      else timers.current.push(window.setTimeout(reveal, ms))
    } catch (failure) {
      give(stake)
      setError(errorMessage(failure))
      setSpinning(false)
    }
  }

  const riskOptions = ARCADE_RISKS.map(option => ({ value: option, label: t(`risk.${option}` as MessageKey), tone: option }))

  return (
    <div className="arcade-game">
      <section className="arcade-stage is-wheel" aria-label={t('game.wheel.title')}>
        <div className="stage-gl" ref={wrapRef} aria-hidden="true" />
        <div className="stage-vignette" aria-hidden="true" />
        <div className="stage-top">
          {recent.length > 0 && (
            <Recent label={t('wheel.recent')}>
              {recent.map((multiplier, index) => <li key={index} className={multiplier >= 5 ? 'is-big' : multiplier >= 2 ? 'is-high' : multiplier >= 1 ? 'is-mid' : 'is-low'}>{multiplier}×</li>)}
            </Recent>
          )}
        </div>
        <ul className="stage-legend" aria-label={t('wheel.legend')}>
          {legend.map(([multiplier, count]) => (
            <li key={multiplier}><i style={{ background: `#${wheelHex(multiplier).toString(16).padStart(6, '0')}` }} aria-hidden="true" /><b>{multiplier}×</b><span>{count}/{segments.length}</span></li>
          ))}
        </ul>
        <ResultBanner outcome={outcome} />
      </section>

      <section className="dock" aria-label={t('arcade.controls')}>
        <div className="dock-group dock-stake"><Stake value={stake} onChange={setStake} available={balance} disabled={spinning} /></div>
        <div className="dock-group">
          <span className="dock-label">{t('risk.label')}</span>
          <Segmented label={t('risk.label')} value={risk} options={riskOptions} onChange={setRisk} disabled={spinning} />
          <p className="dock-fine">{t('wheel.fineprint', { min: number(ARCADE_LIMITS.minBet), max: number(ARCADE_LIMITS.maxBet) })}</p>
        </div>
        <div className="dock-end">
          <button type="button" className="cta" disabled={spinning || !canStake(stake, balance)} onClick={() => { void spin() }}>
            <small>{spinning ? t('arcade.working') : t('wheel.spinLabel')}</small>
            <b>{number(stake)}</b>
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </section>
    </div>
  )
}
