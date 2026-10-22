import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@roulette/api-client'
import { ERROR_CODES, type CrashRound } from '@roulette/contracts'
import { ARCADE_LIMITS, CRASH_SLOTS, multiplierAt, timeToMultiplier } from '@roulette/engine'
import { playCashOut, playCrash, playTick } from '../audio'
import { useI18n } from '../i18n'
import { winFeedback } from '../native'
import { errorMessage } from '../session'
import { FlightScene } from './scenes/FlightScene'
import { Stake, canStake } from './Stake'
import { Recent, ResultBanner, Switch, type Outcome, outcomeDetail } from './ui'
import type { Arcade } from './useArcade'

const GAME = 'AVIATOR'
const SLOTS = CRASH_SLOTS[GAME]
const POLL_MS = 300
const READOUT_MS = 100
const RECENT_SHOWN = 12

type Phase = 'idle' | 'flying' | 'over'

/** An auto cash-out typed by the player: empty means off, NaN means not a price on offer. */
function parseAuto (text: string): number | null {
  if (!text.trim()) return null
  const value = Number(text)
  return value >= 1.01 && value <= 1000 && Math.round(value * 100) / 100 === value ? value : Number.NaN
}

const tone = (multiplier: number) => (multiplier >= 10 ? 'is-big' : multiplier >= 2 ? 'is-high' : 'is-low')

/** Aviator: one flight, up to two bets, each cashed out on its own before the plane flies away. */
export function AviatorGame ({ arcade }: { arcade: Arcade }) {
  const { t, number } = useI18n()
  const { backend, balance, take, give, settle } = arcade

  const [stakes, setStakes] = useState([100, 100])
  const [autos, setAutos] = useState(['', ''])
  const [secondBet, setSecondBet] = useState(false)
  const [round, setRound] = useState<CrashRound | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [landed, setLanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cashing, setCashing] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<number[]>([])
  const [shownMultiplier, setShownMultiplier] = useState(1)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const readoutRef = useRef<HTMLElement>(null)
  /** performance.now() at take-off, as far as the server's clock says. */
  const anchor = useRef(0)
  const crashShownAt = useRef<number | null>(null)
  const given = useRef(new Set<string>())
  const finished = useRef<number | null>(null)
  const balanceRef = useRef(balance)
  const roundRef = useRef<CrashRound | null>(null)
  roundRef.current = round
  const phaseRef = useRef<Phase>('idle')
  phaseRef.current = phase

  const active = secondBet ? 2 : 1
  const autoValues = autos.slice(0, active).map(parseAuto)
  const total = stakes.slice(0, active).reduce((sum, stake) => sum + stake, 0)
  const startable = phase !== 'flying' && !busy && stakes.slice(0, active).every(stake => canStake(stake, balance)) && total <= balance && autoValues.every(value => !Number.isNaN(value))

  const loadRecent = useCallback(() => {
    backend.history(GAME)
      .then(rounds => setRecent(rounds.flatMap(past => (past.game === GAME && past.outcome.crashPoint ? [past.outcome.crashPoint] : [])).slice(0, RECENT_SHOWN)))
      .catch(() => {})
  }, [backend])

  /** Shows a round as the server (or the device) now says it stands; pays out what was cashed. */
  const reveal = useCallback((next: CrashRound) => {
    setRound(next)
    for (const bet of next.outcome.bets) {
      const key = `${next.arcadeRoundId}:${bet.slot}`
      if (bet.state === 'CASHED' && !given.current.has(key)) {
        given.current.add(key)
        give(bet.payout ?? 0)
        playCashOut()
        winFeedback(false)
      }
    }
    if (next.status === 'SETTLED' && finished.current !== next.arcadeRoundId) {
      finished.current = next.arcadeRoundId
      setPhase('over')
      settle(balanceRef.current)
      loadRecent()
      const won = next.payout
      const tone = won >= next.stake * 5 ? 'big' : won > next.stake ? 'win' : won === next.stake ? 'even' : 'lose'
      setOutcome({
        id: next.arcadeRoundId,
        tone,
        title: next.outcome.crashPoint != null ? `${next.outcome.crashPoint.toFixed(2)}×` : '',
        detail: outcomeDetail(t, number, next.stake, won)
      })
    }
  }, [give, settle, loadRecent, t, number])

  /** Picks up a flight that is already in the air (after a reload, or from another tab). */
  const resume = useCallback(async () => {
    const found = await backend.activeCrash(GAME)
    if (found.balance !== null) { balanceRef.current = found.balance; settle(found.balance) }
    if (found.round) {
      anchor.current = performance.now() - (found.round.elapsedMs ?? 0)
      crashShownAt.current = null
      setLanded(false)
      setRound(found.round)
      setPhase('flying')
    } else if (found.landed) {
      finished.current = found.landed.arcadeRoundId
      for (const bet of found.landed.outcome.bets) given.current.add(`${found.landed.arcadeRoundId}:${bet.slot}`)
      setRound(found.landed)
      setPhase('over')
      setLanded(true)
    }
  }, [backend, settle])

  useEffect(() => {
    resume().catch(() => {})
    loadRecent()
    // Once per backend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend])

  // While in the air, ask whether it is still going: the end of the flight is the server's to announce.
  useEffect(() => {
    if (phase !== 'flying') return
    let stopped = false
    const poll = async () => {
      try {
        const found = await backend.activeCrash(GAME)
        if (stopped) return
        if (found.balance !== null) balanceRef.current = found.balance
        const current = roundRef.current
        if (found.landed) reveal(found.landed)
        else if (found.round && current && JSON.stringify(found.round.outcome.bets) !== JSON.stringify(current.outcome.bets)) reveal(found.round)
        else if (!found.round && current) { setPhase('idle'); setRound(null) }
      } catch { /* a missed poll is made up by the next */ }
    }
    const timer = window.setInterval(() => { void poll() }, POLL_MS)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [phase, backend, reveal])

  // The labels on the cash-out buttons follow the multiplier a few times a second.
  useEffect(() => {
    if (phase !== 'flying') return
    const timer = window.setInterval(() => setShownMultiplier(multiplierAt(performance.now() - anchor.current)), READOUT_MS)
    return () => window.clearInterval(timer)
  }, [phase])

  // The picture: a 3D scene fed the state of the flight every frame, from the clock.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    let scene: FlightScene
    try { scene = new FlightScene(wrap) } catch { return }
    let frame = 0
    const render = () => {
      const now = performance.now()
      const phase = phaseRef.current
      const clock = phase === 'idle' ? 0 : now - anchor.current
      const point = roundRef.current?.outcome.crashPoint
      const crashAt = point != null && phase === 'over' ? timeToMultiplier(point) : null
      const crashed = crashAt !== null && clock >= crashAt
      if (crashed && crashShownAt.current === null) {
        crashShownAt.current = now
        setLanded(true)
        playCrash()
      }
      const drawn = crashed ? crashAt : clock
      scene.update({
        elapsedMs: drawn,
        crashedAtMs: crashed ? crashAt : null,
        sinceCrashMs: crashShownAt.current === null ? 0 : now - crashShownAt.current
      })
      if (readoutRef.current) readoutRef.current.textContent = `${(phase === 'idle' ? 1 : multiplierAt(drawn)).toFixed(2)}×`
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    return () => { cancelAnimationFrame(frame); scene.dispose() }
  }, [])

  async function takeOff () {
    setError(null)
    setOutcome(null)
    setBusy(true)
    try {
      const bets = Array.from({ length: active }, (_, slot) => ({ stake: stakes[slot], autoCashout: autoValues[slot] }))
      const started = await backend.startCrash(GAME, bets)
      given.current = new Set()
      finished.current = null
      crashShownAt.current = null
      balanceRef.current = started.balance
      anchor.current = performance.now() - (started.round.elapsedMs ?? 0)
      take(total)
      setLanded(false)
      setShownMultiplier(1)
      setRound(started.round)
      setPhase('flying')
      playTick(0.7)
    } catch (failure) {
      setError(errorMessage(failure))
      if (failure instanceof ApiError && failure.errorCode === ERROR_CODES.ArcadeRoundActive) await resume().catch(() => {})
    } finally {
      setBusy(false)
    }
  }

  async function cashOut (slot: number) {
    if (!round || cashing.includes(slot)) return
    setError(null)
    setCashing(current => [...current, slot])
    try {
      const result = await backend.cashOut(round, slot)
      balanceRef.current = result.balance
      reveal(result.round)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setCashing(current => current.filter(other => other !== slot))
    }
  }

  const flying = phase === 'flying'
  const bets = round?.outcome.bets ?? []
  const crashPoint = round?.outcome.crashPoint
  const status = phase === 'idle'
    ? t('crash.ready')
    : landed && crashPoint != null ? t('crash.crashedAt', { x: crashPoint.toFixed(2) }) : t('crash.flying')

  return (
    <div className="arcade-game">
      <section className={`arcade-stage is-flight${landed ? ' is-crashed' : ''}`} aria-label={t('game.aviator.title')}>
        <div className="stage-gl" ref={wrapRef} aria-hidden="true" />
        <div className="stage-vignette" aria-hidden="true" />
        <div className="stage-top">
          {recent.length > 0 && (
            <Recent label={t('crash.recent')}>
              {recent.map((point, index) => <li key={index} className={tone(point)}>{point.toFixed(2)}×</li>)}
            </Recent>
          )}
        </div>
        <div className="flight-readout" aria-hidden="true">
          <strong ref={readoutRef}>1.00×</strong>
          <span>{status}</span>
        </div>
        <ResultBanner outcome={outcome} />
        <p className="sr-only" role="status">{phase === 'over' && landed && crashPoint != null ? t('crash.crashedAt', { x: crashPoint.toFixed(2) }) : ''}</p>
      </section>

      <section className="dock dock-flight" aria-label={t('arcade.controls')}>
        <div className="bet-cards">
          {Array.from({ length: SLOTS }, (_, slot) => {
            const live = bets.find(bet => bet.slot === slot)
            const enabled = slot === 0 || secondBet
            const locked = flying || busy
            return (
              <div key={slot} className={`bet-card${enabled ? '' : ' is-off'}${live?.state === 'CASHED' ? ' is-cashed' : ''}${live?.state === 'CRASHED' ? ' is-lost' : ''}`} role="group" aria-label={t('crash.betN', { n: slot + 1 })}>
                <div className="bet-card-head">
                  <span className="bet-card-title">{t('crash.betN', { n: slot + 1 })}</span>
                  {slot === 1 && <Switch checked={secondBet} disabled={locked} onChange={setSecondBet}>{t('crash.addSecond')}</Switch>}
                </div>
                {enabled
                  ? (
                    <>
                      <Stake
                        compact
                        value={stakes[slot]}
                        disabled={locked}
                        available={balance - (slot === 1 ? stakes[0] : 0)}
                        onChange={value => setStakes(current => current.map((stake, index) => (index === slot ? value : stake)))}
                      />
                      <label className="auto-field">
                        <span className="dock-label">{t('crash.auto')}</span>
                        <span className="auto-input">
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder={t('crash.autoOff')}
                            value={autos[slot]}
                            disabled={locked}
                            aria-invalid={Number.isNaN(parseAuto(autos[slot]))}
                            onChange={event => setAutos(current => current.map((text, index) => (index === slot ? event.target.value.replace(',', '.') : text)))}
                          />
                          <b aria-hidden="true">×</b>
                        </span>
                      </label>
                    </>
                    )
                  : <p className="bet-card-off">{t('crash.secondHint')}</p>}
                {flying && live?.state === 'ACTIVE' && (
                  <button type="button" className="cta cta-cash" disabled={cashing.includes(slot)} onClick={() => { void cashOut(slot) }}>
                    <small>{t('crash.cashOutLabel')}</small>
                    <b>{number(Math.floor(live.stake * shownMultiplier))}</b>
                  </button>
                )}
                {live && live.state !== 'ACTIVE' && (
                  <p className={`bet-result ${live.state === 'CASHED' ? 'is-up' : 'is-down'}`}>
                    {live.state === 'CASHED'
                      ? t('crash.result.cashed', { x: (live.multiplier ?? 1).toFixed(2), amount: number(live.payout ?? 0) })
                      : t('crash.result.lost', { amount: number(live.stake) })}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <div className="dock-end">
          {flying && (
            <div className="flight-summary">
              <span className="dock-label">{t('crash.inPlay')}</span>
              <strong>{number(bets.filter(bet => bet.state === 'ACTIVE').reduce((sum, bet) => sum + bet.stake, 0))}</strong>
              <small>{t('crash.worthNow', { amount: number(bets.filter(bet => bet.state === 'ACTIVE').reduce((sum, bet) => sum + Math.floor(bet.stake * shownMultiplier), 0)) })}</small>
            </div>
          )}
          {!flying && (
            <button type="button" className="cta" disabled={!startable} onClick={() => { void takeOff() }}>
              <small>{busy ? t('arcade.working') : t('crash.takeOffLabel')}</small>
              <b>{number(total)}</b>
            </button>
          )}
          <p className="dock-fine">{t('crash.fineprint', { min: number(ARCADE_LIMITS.minBet), max: number(ARCADE_LIMITS.maxBet) })}</p>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </section>
    </div>
  )
}
