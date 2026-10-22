import { useEffect, useMemo, useRef, useState } from 'react'
import type { HorsesRound } from '@roulette/contracts'
import { ARCADE_LIMITS, HORSES, arcadePayout } from '@roulette/engine'
import { playCashOut, playCrash, playTick } from '../audio'
import { useI18n } from '../i18n'
import { winFeedback } from '../native'
import { errorMessage } from '../session'
import { Stake, canStake } from './Stake'
import { Recent, ResultBanner, toneFor, type Outcome, outcomeDetail } from './ui'
import { HorsesScene, SILK_HEX } from './scenes/HorsesScene'
import type { Arcade } from './useArcade'

/** Racing silks: one colour per horse. */
const SILKS = SILK_HEX.map(hex => `#${hex.toString(16).padStart(6, '0')}`)

/** The winner takes this long; each place after adds a little. */
const WINNER_MS = 7000
const GAP_MS = 450
const RECENT_SHOWN = 10

/** A small seeded generator so a race looks the same wherever it is replayed. */
function seeded (seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

interface Pace {
  finishMs: number
  /** Two surges that make the horse move up and drop back along the way. */
  waves: Array<{ amplitude: number, frequency: number, phase: number }>
}

/** How each horse runs: the finishing order is fixed, how they get there is for show. */
function pacesFor (order: number[], seed: number): Pace[] {
  const random = seeded(seed)
  const paces: Pace[] = HORSES.map(() => ({ finishMs: 0, waves: [] }))
  order.forEach((horse, place) => {
    paces[horse] = {
      finishMs: WINNER_MS + place * GAP_MS + random() * 120,
      waves: [0, 1].map(wave => ({ amplitude: 0.28 + random() * 0.3, frequency: (wave + 1) * (0.0006 + random() * 0.0007), phase: random() * Math.PI * 2 }))
    }
  })
  return paces
}

/** How far along the track (0 to 1) a horse is: a speed that never goes below zero, scaled to end at the line on time. */
function progress (pace: Pace, ms: number): number {
  const distance = (t: number) => pace.waves.reduce(
    (sum, { amplitude, frequency, phase }) => sum - (amplitude / frequency) * (Math.cos(frequency * t + phase) - Math.cos(phase)),
    t
  )
  return Math.min(1, Math.max(0, distance(Math.min(ms, pace.finishMs)) / distance(pace.finishMs)))
}

export function HorsesGame ({ arcade }: { arcade: Arcade }) {
  const { t, number } = useI18n()
  const { backend, balance, take, give, settle } = arcade

  const [stake, setStake] = useState(100)
  const [picked, setPicked] = useState<number[]>([])
  const [phase, setPhase] = useState<'idle' | 'racing' | 'over'>('idle')
  const [result, setResult] = useState<HorsesRound | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [winners, setWinners] = useState<number[]>([])

  const wrapRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HorsesScene | null>(null)
  const raf = useRef(0)

  const total = stake * picked.length
  const affordable = picked.length > 0 && canStake(stake, balance) && total <= balance

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    try { sceneRef.current = new HorsesScene(wrap) } catch { return }
    return () => { sceneRef.current?.dispose(); sceneRef.current = null }
  }, [])

  useEffect(() => {
    backend.history('HORSES')
      .then(rounds => setWinners(rounds.flatMap(round => (round.game === 'HORSES' ? [round.outcome.winner] : [])).slice(0, RECENT_SHOWN)))
      .catch(() => {})
    return () => cancelAnimationFrame(raf.current)
  }, [backend])

  const finishOrder = useMemo(() => result?.outcome.order ?? [], [result])

  function place (race: HorsesRound, balanceAfter: number) {
    const paces = pacesFor(race.outcome.order, race.outcome.seed)
    const started = performance.now()
    let lastBeat = 0
    setPhase('racing')
    const frame = (now: number) => {
      const elapsed = now - started
      paces.forEach((pace, horse) => sceneRef.current?.setProgress(horse, progress(pace, elapsed)))
      if (now - lastBeat > 140) { lastBeat = now; playTick(0.45 + Math.random() * 0.1) }
      if (elapsed >= Math.max(...paces.map(pace => pace.finishMs)) + 250) {
        sceneRef.current?.celebrate(race.outcome.winner)
        setPhase('over')
        give(race.payout)
        settle(balanceAfter)
        setWinners(current => [race.outcome.winner, ...current].slice(0, RECENT_SHOWN))
        if (race.payout > 0) { playCashOut(); winFeedback(race.payout >= race.stake * 5) } else playCrash()
        return
      }
      raf.current = requestAnimationFrame(frame)
    }
    raf.current = requestAnimationFrame(frame)
  }

  async function race () {
    setError(null)
    setResult(null)
    // Back at the gate.
    sceneRef.current?.reset()
    take(total)
    try {
      const bets = picked.map(horse => ({ horse, stake }))
      const played = await backend.horses(bets)
      setResult(played.round)
      place(played.round, played.balance)
    } catch (failure) {
      give(total)
      setError(errorMessage(failure))
      setPhase('idle')
    }
  }

  const racing = phase === 'racing'
  const toggle = (horse: number) => setPicked(current => (current.includes(horse) ? current.filter(other => other !== horse) : [...current, horse].sort()))
  const won = result ? result.payout > 0 : false
  const winner = result ? HORSES[result.outcome.winner] : null
  const outcome: Outcome | null = phase === 'over' && result && winner
    ? {
        id: result.arcadeRoundId,
        tone: toneFor(result.stake, result.payout),
        title: winner.name,
        detail: won ? outcomeDetail(t, number, result.stake, result.payout) : t('horses.lost', { name: winner.name })
      }
    : null

  return (
    <div className="arcade-game">
      <section className="arcade-stage is-horses" aria-label={t('game.horses.title')}>
        <div className="stage-gl" ref={wrapRef} aria-hidden="true" />
        <div className="stage-vignette" aria-hidden="true" />
        <div className="stage-top">
          {winners.length > 0 && (
            <Recent label={t('horses.recent')}>
              {winners.map((horse, index) => <li key={index} className="is-silk" style={{ ['--silk' as string]: SILKS[horse] }}>{horse + 1}</li>)}
            </Recent>
          )}
        </div>
        {phase === 'over' && finishOrder.length > 0 && (
          <ol className="horse-order" aria-label={t('horses.finish')}>
            {finishOrder.map((horse, place) => (
              <li key={horse} className={place === 0 ? 'is-winner' : ''}>
                <b>{t(`horses.place.${place + 1}` as 'horses.place.1')}</b>
                <i style={{ background: SILKS[horse] }} aria-hidden="true">{horse + 1}</i>
                <span>{HORSES[horse].name}</span>
              </li>
            ))}
          </ol>
        )}
        <ResultBanner outcome={outcome} />
      </section>

      <section className="dock dock-horses" aria-label={t('arcade.controls')}>
        <fieldset className="runners" disabled={racing}>
          <legend className="dock-label">{t('horses.pick')}</legend>
          <div className="runner-grid">
          {HORSES.map((horse, index) => {
            const on = picked.includes(index)
            return (
              <label key={horse.name} className={`runner-card${on ? ' is-picked' : ''}`} style={{ ['--silk' as string]: SILKS[index] }}>
                <input type="checkbox" checked={on} onChange={() => toggle(index)} />
                <i className="runner-silk" aria-hidden="true">{index + 1}</i>
                <span className="runner-name">{horse.name}</span>
                <b className="runner-odds">{horse.odds.toFixed(2)}×</b>
                <span className="runner-chance" aria-hidden="true"><u style={{ width: `${Math.round(horse.chance * 100 * 2.6)}%` }} /></span>
                <small>{on ? t('horses.returns', { amount: number(arcadePayout(stake, horse.odds)) }) : t('horses.chance', { percent: Math.round(horse.chance * 100) })}</small>
              </label>
            )
          })}
          </div>
        </fieldset>
        <div className="dock-row">
          <div className="dock-group dock-stake"><Stake label={t('horses.stakeEach')} value={stake} onChange={setStake} available={balance} disabled={racing} /></div>
          <div className="dock-group dock-summary">
            <span className="dock-label">{t('horses.totalBet')}</span>
            <strong className="summary-number">{number(total)}</strong>
            <small>{t('horses.selected', { count: picked.length })}</small>
            <p className="dock-fine">{t('horses.fineprint', { min: number(ARCADE_LIMITS.minBet), max: number(ARCADE_LIMITS.maxBet) })}</p>
          </div>
          <div className="dock-end">
            <button type="button" className="cta" disabled={!affordable || racing} onClick={() => { void race() }}>
              <small>{racing ? t('arcade.working') : picked.length ? t('horses.raceLabel') : t('horses.pickFirst')}</small>
              <b>{picked.length ? number(total) : '—'}</b>
            </button>
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
        </div>
      </section>
    </div>
  )
}
