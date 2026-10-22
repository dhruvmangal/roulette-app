import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlinkoRound } from '@roulette/contracts'
import { ARCADE_LIMITS, ARCADE_RISKS, PLINKO_ROWS, plinkoMultipliers, type ArcadeRisk } from '@roulette/engine'
import { playCashOut, playTick } from '../audio'
import { useI18n, type MessageKey } from '../i18n'
import { tapFeedback, winFeedback } from '../native'
import { errorMessage } from '../session'
import { PlinkoScene } from './scenes/PlinkoScene'
import { Stake, canStake } from './Stake'
import { Recent, ResultBanner, Segmented, Switch, toneFor, type Outcome, outcomeDetail } from './ui'
import type { Arcade } from './useArcade'

const RECENT_SHOWN = 12
const AUTO_PAUSE_MS = 450

export function PlinkoGame ({ arcade }: { arcade: Arcade }) {
  const { t, number } = useI18n()
  const { backend, balance, take, give, settle } = arcade

  const [stake, setStake] = useState(100)
  const [rows, setRows] = useState(12)
  const [risk, setRisk] = useState<ArcadeRisk>('medium')
  const [auto, setAuto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [recent, setRecent] = useState<number[]>([])

  const wrapRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<PlinkoScene | null>(null)
  const flying = useRef(false)
  const balanceRef = useRef(balance)
  const autoRef = useRef(auto)
  autoRef.current = auto
  const dropRef = useRef<() => void>(() => {})

  const multipliers = useMemo(() => plinkoMultipliers(rows, risk), [rows, risk])
  const affordable = canStake(stake, balance)

  useEffect(() => {
    backend.history('PLINKO')
      .then(rounds => setRecent(rounds.flatMap(round => (round.game === 'PLINKO' ? [round.outcome.multiplier] : [])).slice(0, RECENT_SHOWN)))
      .catch(() => {})
  }, [backend])

  // The 3D board, made once and laid out again when the rows or the risk change.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    try { sceneRef.current = new PlinkoScene(wrap) } catch { return }
    return () => { sceneRef.current?.dispose(); sceneRef.current = null }
  }, [])
  useEffect(() => { sceneRef.current?.setBoard(rows, multipliers) }, [rows, multipliers])

  const land = useCallback((round: PlinkoRound) => {
    flying.current = false
    give(round.payout)
    settle(balanceRef.current)
    setOutcome({
      id: round.arcadeRoundId,
      tone: toneFor(round.stake, round.payout),
      title: `${round.outcome.multiplier}×`,
      detail: outcomeDetail(t, number, round.stake, round.payout)
    })
    setRecent(current => [round.outcome.multiplier, ...current].slice(0, RECENT_SHOWN))
    if (round.payout > round.stake) { playCashOut(); winFeedback(round.outcome.multiplier >= 10) } else playTick(0.6)
    tapFeedback()
    setBusy(false)
    if (autoRef.current) window.setTimeout(() => { if (autoRef.current) dropRef.current() }, AUTO_PAUSE_MS)
  }, [give, settle, t, number])

  const drop = useCallback(async () => {
    if (flying.current) return
    setError(null)
    setBusy(true)
    try {
      take(stake)
      const played = await backend.plinko({ stake, rows, risk })
      balanceRef.current = played.balance
      flying.current = true
      setOutcome(null)
      const step = Math.min(300, Math.max(150, 3300 / rows))
      sceneRef.current?.drop(played.round.outcome.path, step, {
        onPeg: () => playTick(0.9 + Math.random() * 0.4),
        onLand: () => land(played.round)
      })
    } catch (failure) {
      give(stake)
      setError(errorMessage(failure))
      setAuto(false)
      setBusy(false)
    }
  }, [backend, stake, rows, risk, take, give, settle, land])
  dropRef.current = () => { void drop() }

  // Auto stops when the chips run out.
  useEffect(() => { if (auto && !affordable && !busy) setAuto(false) }, [auto, affordable, busy])

  const controlsLocked = busy || auto
  const riskOptions = ARCADE_RISKS.map(option => ({ value: option, label: t(`risk.${option}` as MessageKey), tone: option }))

  return (
    <div className="arcade-game">
      <section className="arcade-stage is-plinko" aria-label={t('game.plinko.title')}>
        <div className="stage-gl" ref={wrapRef} aria-hidden="true" />
        <div className="stage-vignette" aria-hidden="true" />
        <div className="stage-top">
          {recent.length > 0 && (
            <Recent label={t('plinko.recent')}>
              {recent.map((multiplier, index) => <li key={index} className={multiplier >= 10 ? 'is-big' : multiplier >= 2 ? 'is-high' : multiplier >= 1 ? 'is-mid' : 'is-low'}>{multiplier}×</li>)}
            </Recent>
          )}
        </div>
        <ResultBanner outcome={outcome} />
      </section>

      <section className="dock" aria-label={t('arcade.controls')}>
        <div className="dock-group dock-stake"><Stake value={stake} onChange={setStake} available={balance} disabled={controlsLocked} /></div>
        <div className="dock-group">
          <span className="dock-label">{t('risk.label')}</span>
          <Segmented label={t('risk.label')} value={risk} options={riskOptions} onChange={setRisk} disabled={controlsLocked} />
          <label className="rows-field">
            <span className="dock-label">{t('plinko.rows', { count: rows })}</span>
            <input type="range" min={PLINKO_ROWS.min} max={PLINKO_ROWS.max} step={1} value={rows} disabled={controlsLocked} onChange={event => setRows(Number(event.target.value))} />
          </label>
        </div>
        <div className="dock-end">
          <button type="button" className="cta" disabled={!affordable || (busy && !auto)} onClick={() => { if (auto) setAuto(false); else void drop() }}>
            <small>{auto ? t('plinko.stopAuto') : busy ? t('arcade.working') : t('plinko.dropLabel')}</small>
            <b>{auto ? '■' : number(stake)}</b>
          </button>
          <Switch checked={auto} disabled={!affordable && !auto} onChange={checked => { setAuto(checked); if (checked && !busy) void drop() }}>{t('plinko.auto')}</Switch>
          <p className="dock-fine">{t('plinko.fineprint', { min: number(ARCADE_LIMITS.minBet), max: number(ARCADE_LIMITS.maxBet) })}</p>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </section>
    </div>
  )
}
