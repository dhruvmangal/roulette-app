import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { PAYOUTS, getVariant, type BetType, type VariantName } from '@roulette/engine'
import { simulateSession, summarizeSessions, type LabSummary, type SessionResult, type StrategyId } from '@roulette/game-client'
import { roundedTop, signed, tooltipLeft, trend, useWidth } from './charts'
import { useI18n, type MessageKey } from './i18n'

const PERCENT: Intl.NumberFormatOptions = { style: 'percent', maximumFractionDigits: 1 }
const WHEELS: VariantName[] = ['ENGLISH', 'AMERICAN']

const ODDS: Array<{ type: BetType, covers: number, americanOnly?: boolean }> = [
  { type: 'STRAIGHT', covers: 1 },
  { type: 'SPLIT', covers: 2 },
  { type: 'STREET', covers: 3 },
  { type: 'CORNER', covers: 4 },
  { type: 'TOP_LINE', covers: 5, americanOnly: true },
  { type: 'SIX_LINE', covers: 6 },
  { type: 'DOZEN', covers: 12 },
  { type: 'COLUMN', covers: 12 },
  { type: 'RED', covers: 18 }
]

// The words for each system (name, tag, idea, steps, catch) are in the language catalogs, by id.
const GUIDES: Array<{ id: StrategyId, risk: 'low' | 'medium' | 'high', steps: number }> = [
  { id: 'FLAT', risk: 'low', steps: 2 },
  { id: 'MARTINGALE', risk: 'high', steps: 3 },
  { id: 'PAROLI', risk: 'medium', steps: 3 },
  { id: 'DALEMBERT', risk: 'medium', steps: 3 },
  { id: 'FIBONACCI', risk: 'medium', steps: 3 },
  { id: 'JAMES_BOND', risk: 'medium', steps: 3 },
  { id: 'HOT_NUMBERS', risk: 'high', steps: 2 }
]

const guideText = (id: StrategyId, part: string) => `learn.g.${id}.${part}` as MessageKey

const BANKROLLS = [500, 1000, 5000]
const UNITS = [1, 5, 25]
const ROUNDS = [50, 100, 250]
const SESSIONS = 1000
const SAMPLE_PATHS = 24
const CHUNK = 100

interface LabRun {
  key: string
  summary: LabSummary
  results: SessionResult[]
  rounds: number
}

/** Bankroll spread across all sessions, round by round: the middle 80% as a band, the median as a line, and a few real sessions. */
function PathsChart ({ run }: { run: LabRun }) {
  const { t } = useI18n()
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 240
  const pad = { top: 16, right: 12, bottom: 24, left: 56 }
  const bankroll = run.summary.bankroll

  const bands = useMemo(() => {
    const out: Array<{ p10: number, p50: number, p90: number }> = []
    for (let round = 0; round <= run.rounds; round++) {
      const values = run.results.map(result => result.path[Math.min(round, result.path.length - 1)]).sort((a, b) => a - b)
      const at = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))]
      out.push({ p10: at(0.1), p50: at(0.5), p90: at(0.9) })
    }
    return out
  }, [run])

  const samples = run.results.slice(0, SAMPLE_PATHS)
  const max = Math.max(bankroll, ...bands.map(band => band.p90), ...samples.flatMap(sample => sample.path))
  const plotWidth = Math.max(0, width - pad.left - pad.right)
  const x = (round: number) => pad.left + round / run.rounds * plotWidth
  const y = (value: number) => pad.top + (1 - value / max) * (height - pad.top - pad.bottom)
  const line = (values: number[]) => values.map((value, round) => `${round ? 'L' : 'M'}${x(round).toFixed(1)},${y(value).toFixed(1)}`).join('')
  const band = `${line(bands.map(b => b.p90))}${bands.map((b, round) => `L${x(bands.length - 1 - round).toFixed(1)},${y(bands[bands.length - 1 - round].p10).toFixed(1)}`).join('')}Z`
  const active = hover === null ? null : bands[hover]

  function track (event: React.PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    setHover(Math.max(0, Math.min(run.rounds, Math.round((event.clientX - box.left) / box.width * run.rounds))))
  }

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={t('learn.chart.pathsAria', { rounds: run.rounds, value: Math.round(bands[run.rounds].p50) })}>
          {[max, bankroll, 0].map(value => (
            <g key={value}>
              <line className={value === bankroll ? 'chart-start' : value === 0 ? 'chart-baseline' : 'chart-grid'} x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} />
              <text className="chart-axis" x={pad.left - 8} y={y(value) + 4} textAnchor="end">{Math.round(value).toLocaleString()}</text>
            </g>
          ))}
          <text className="chart-axis" x={pad.left} y={height - 6}>{t('learn.chart.round0')}</text>
          <text className="chart-axis" x={width - pad.right} y={height - 6} textAnchor="end">{run.rounds}</text>
          <path className="chart-band" d={band} />
          {samples.map((sample, index) => <path key={index} className="chart-sample" d={line(sample.path)} />)}
          <path className="chart-line" d={line(bands.map(b => b.p50))} />
          {active && hover !== null && (
            <>
              <line className="chart-crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={height - pad.bottom} />
              <circle className="chart-dot" cx={x(hover)} cy={y(active.p50)} r={5} />
            </>
          )}
          <rect x={pad.left} y={0} width={plotWidth} height={height} fill="transparent" onPointerMove={track} onPointerDown={track} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {active && hover !== null && (
        <div className="chart-tooltip" style={{ left: tooltipLeft(x(hover), width, 90), top: 0 }}>
          <strong>{t('learn.chart.afterRound', { round: hover })}</strong>
          <span>{t('learn.chart.median')} <b>{Math.round(active.p50).toLocaleString()}</b></span>
          <span>{t('learn.chart.middle80')} <b>{Math.round(active.p10).toLocaleString()}–{Math.round(active.p90).toLocaleString()}</b></span>
        </div>
      )}
      <div className="chart-legend" aria-hidden="true">
        <span><i className="key-line" /> {t('learn.chart.legendMedian')}</span>
        <span><i className="key-band" /> {t('learn.chart.legendBand')}</span>
        <span><i className="key-sample" /> {t('learn.chart.legendSamples', { count: SAMPLE_PATHS })}</span>
        <span><i className="key-start" /> {t('learn.chart.legendStart')}</span>
      </div>
    </div>
  )
}

/** How many sessions ended at each bankroll. */
function FinalsChart ({ run }: { run: LabRun }) {
  const { t, number } = useI18n()
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 140
  const bottom = 22
  const { bankroll, bestFinal } = run.summary
  const bins = 24
  const top = Math.max(bestFinal, bankroll * 1.05)
  const size = top / bins
  const counts = useMemo(() => {
    const out = Array<number>(bins).fill(0)
    for (const result of run.results) out[Math.min(bins - 1, Math.floor(result.final / size))]++
    return out
  }, [run, size])
  const most = Math.max(...counts)
  const slot = width / bins

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={t('learn.chart.finalsAria')} onPointerLeave={() => setHover(null)}>
          <line className="chart-baseline" x1={0} x2={width} y1={height - bottom} y2={height - bottom} />
          {counts.map((count, bin) => (
            <g key={bin} onPointerEnter={() => setHover(bin)} onPointerDown={() => setHover(bin)}>
              <rect x={bin * slot} y={0} width={slot} height={height} fill="transparent" />
              {count > 0 && <path className={`chart-bar${hover === bin ? ' is-hover' : ''}${(bin + 1) * size <= bankroll ? ' is-below' : ''}`} d={roundedTop(bin * slot + 1, height - bottom, Math.max(2, slot - 2), Math.max(3, count / most * (height - bottom - 8)))} />}
            </g>
          ))}
          <line className="chart-start" x1={bankroll / size * slot} x2={bankroll / size * slot} y1={0} y2={height - bottom} />
          <text className="chart-axis" x={0} y={height - 4}>0</text>
          <text className="chart-axis" x={bankroll / size * slot} y={height - 4} textAnchor="middle">{bankroll.toLocaleString()}</text>
          <text className="chart-axis" x={width} y={height - 4} textAnchor="end">{Math.round(top).toLocaleString()}</text>
        </svg>
      )}
      {hover !== null && (
        <div className="chart-tooltip" style={{ left: tooltipLeft((hover + 0.5) * slot, width, 80), top: 0 }}>
          <strong>{t('learn.chart.ended', { from: Math.round(hover * size).toLocaleString(), to: Math.round((hover + 1) * size).toLocaleString() })}</strong>
          <span>{t('learn.chart.sessions', { count: counts[hover], percent: number(counts[hover] / run.results.length, PERCENT) })}</span>
        </div>
      )}
    </div>
  )
}

function Choice<T extends string | number> ({ label, options, value, onChange, format = String }: { label: string, options: readonly T[], value: T, onChange: (next: T) => void, format?: (value: T) => string }) {
  return (
    <div className="lab-field">
      <span className="stat-label">{label}</span>
      <div className="view-switch" role="radiogroup" aria-label={label}>
        {options.map(option => (
          <button key={option} type="button" role="radio" aria-checked={value === option} className={value === option ? 'is-active' : ''} onClick={() => onChange(option)}>{format(option)}</button>
        ))}
      </div>
    </div>
  )
}

function StrategyLab ({ strategy, onStrategy }: { strategy: StrategyId, onStrategy: (next: StrategyId) => void }) {
  const { t, number, rich } = useI18n()
  const percent = (value: number) => number(value, PERCENT)
  const [variant, setVariant] = useState<VariantName>('ENGLISH')
  const [bankroll, setBankroll] = useState(1000)
  const [unit, setUnit] = useState(5)
  const [rounds, setRounds] = useState(100)
  const [run, setRun] = useState<LabRun | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const job = useRef(0)

  const key = `${strategy}:${variant}:${bankroll}:${unit}:${rounds}`

  function start () {
    const id = ++job.current
    const results: SessionResult[] = []
    const randomInt = (max: number) => Math.floor(Math.random() * max)
    setProgress(0)
    // Runs in chunks so the page stays responsive while 1,000 sessions play out.
    const step = () => {
      if (id !== job.current) return
      for (let i = 0; i < CHUNK && results.length < SESSIONS; i++) {
        results.push(simulateSession({ strategy, variant, bankroll, unit, rounds, randomInt }))
      }
      if (results.length < SESSIONS) {
        setProgress(results.length / SESSIONS)
        setTimeout(step, 0)
      } else {
        setRun({ key, results, rounds, summary: summarizeSessions(results, bankroll) })
        setProgress(null)
      }
    }
    setTimeout(step, 0)
  }

  // Cancel a run in progress if the screen goes away.
  useEffect(() => () => { job.current++ }, [])

  const s = run?.summary
  const stale = run !== null && run.key !== key
  const progression = ['MARTINGALE', 'DALEMBERT', 'FIBONACCI'].includes(run?.key.split(':')[0] ?? '')

  return (
    <section className="analytics-card lab" id="lab" aria-labelledby="lab-heading">
      <h2 id="lab-heading">{t('learn.lab.title')}</h2>
      <p className="analytics-note">{t('learn.lab.lede', { count: number(SESSIONS) })}</p>

      <div className="lab-controls">
        <label className="lab-field">
          <span className="stat-label">{t('learn.lab.system')}</span>
          <select className="lab-select" value={strategy} onChange={event => onStrategy(event.target.value as StrategyId)}>
            {GUIDES.map(entry => <option key={entry.id} value={entry.id}>{t(guideText(entry.id, 'name'))}</option>)}
          </select>
        </label>
        <Choice label={t('online.wheel')} options={WHEELS} value={variant} onChange={setVariant} format={id => t(`variant.${id}` as MessageKey)} />
        <Choice label={t('learn.lab.bankroll')} options={BANKROLLS} value={bankroll} onChange={setBankroll} format={value => number(value)} />
        <Choice label={t('learn.lab.baseBet')} options={UNITS} value={unit} onChange={setUnit} />
        <Choice label={t('learn.lab.rounds')} options={ROUNDS} value={rounds} onChange={setRounds} />
      </div>
      <div className="lab-run">
        <button type="button" className="btn-gold" onClick={start} disabled={progress !== null}>
          {progress !== null ? t('learn.lab.playing', { percent: Math.round(progress * 100) }) : run && !stale ? t('learn.lab.again') : t('learn.lab.play', { count: number(SESSIONS) })}
        </button>
        {stale && progress === null && <small className="stat-note">{t('learn.lab.stale')}</small>}
      </div>

      {run && s && (
        <div className={`lab-results${stale ? ' is-stale' : ''}`} aria-live="polite">
          <p className="lab-verdict">
            {rich(s.busted > 0 ? 'learn.lab.verdictBust' : 'learn.lab.verdict', {
              sessions: number(s.sessions),
              ahead: <b>{percent(s.ahead)}</b>,
              bust: <b className="is-down">{percent(s.busted)}</b>,
              average: <b className={trend(s.averageNet)}>{signed(s.averageNet)}</b>,
              expected: <b>{signed(s.averageExpectedNet)}</b>,
              staked: number(Math.round(s.averageStaked))
            })}
          </p>
          <div className="stat-grid">
            <div className="stat-tile"><span className="stat-label">{t('learn.lab.finishedAhead')}</span><strong className="stat-value">{percent(s.ahead)}</strong></div>
            <div className="stat-tile"><span className="stat-label">{t('learn.lab.wentBust')}</span><strong className={`stat-value ${s.busted > 0 ? 'is-down' : ''}`}>{percent(s.busted)}</strong></div>
            <div className="stat-tile"><span className="stat-label">{t('learn.lab.medianFinish')}</span><strong className="stat-value">{number(Math.round(s.medianFinal))}</strong><small className="stat-note">{t('learn.lab.from', { amount: number(s.bankroll) })}</small></div>
            <div className="stat-tile"><span className="stat-label">{t('learn.lab.averageResult')}</span><strong className={`stat-value ${trend(s.averageNet)}`}>{signed(s.averageNet)}</strong><small className="stat-note">{t('learn.lab.edgeSays', { value: signed(s.averageExpectedNet) })}</small></div>
            {progression && <div className="stat-tile"><span className="stat-label">{t('learn.lab.wall')}</span><strong className="stat-value">{percent(s.hitTheWall)}</strong><small className="stat-note">{t('learn.lab.wallNote')}</small></div>}
          </div>
          <h3>{t('learn.lab.pathsTitle')}</h3>
          <PathsChart run={run} />
          <h3>{t('learn.lab.finalsTitle')}</h3>
          <FinalsChart run={run} />
          <p className="analytics-note">{t('learn.lab.finalsNote')}</p>
          <details className="lab-table">
            <summary>{t('learn.lab.asTable')}</summary>
            <table className="summary-table">
              <tbody>
                <tr><th scope="row">{t('learn.lab.rowSessions')}</th><td>{number(s.sessions)}</td></tr>
                <tr><th scope="row">{t('learn.lab.finishedAhead')}</th><td>{percent(s.ahead)}</td></tr>
                <tr><th scope="row">{t('learn.lab.wentBust')}</th><td>{percent(s.busted)}</td></tr>
                <tr><th scope="row">{t('learn.lab.rowFinish')}</th><td>{number(Math.round(s.medianFinal))} / {number(s.bestFinal)} / {number(s.worstFinal)}</td></tr>
                <tr><th scope="row">{t('learn.lab.rowStaked')}</th><td>{number(Math.round(s.averageStaked))}</td></tr>
                <tr><th scope="row">{t('learn.lab.rowAverage')}</th><td>{signed(s.averageNet)} / {signed(s.averageExpectedNet)}</td></tr>
              </tbody>
            </table>
          </details>
        </div>
      )}
    </section>
  )
}

/** How the bets pay, what the popular betting systems do, and a lab that plays them out. */
export function LearnScreen () {
  const { t, number } = useI18n()
  const percent = (value: number) => number(value, PERCENT)
  const [variant, setVariant] = useState<VariantName>('ENGLISH')
  const [labStrategy, setLabStrategy] = useState<StrategyId>('MARTINGALE')
  const pockets = getVariant(variant).pockets.length

  function tryInLab (id: StrategyId) {
    setLabStrategy(id)
    document.getElementById('lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main className="page learn">
      <section className="page-head">
        <p className="eyebrow">{t('nav.learn')}</p>
        <h1 className="page-title">{t('learn.titleA')} <em>{t('learn.titleB')}</em></h1>
        <p className="lede">{t('learn.lede')}</p>
        <nav className="learn-nav" aria-label={t('learn.nav.aria')}>
          <a href="#odds">{t('learn.odds.title')}</a>
          <a href="#systems">{t('learn.systems.title')}</a>
          <a href="#lab">{t('learn.lab.title')}</a>
          <a href="#myths">{t('learn.nav.myths')}</a>
        </nav>
      </section>

      <section className="analytics-card" id="odds" aria-labelledby="odds-heading">
        <div className="learn-card-head">
          <h2 id="odds-heading">{t('learn.odds.title')}</h2>
          <div className="view-switch" role="tablist" aria-label={t('online.wheel')}>
            {WHEELS.map(wheel => (
              <button key={wheel} type="button" role="tab" aria-selected={variant === wheel} className={variant === wheel ? 'is-active' : ''} onClick={() => setVariant(wheel)}>{t(`variant.${wheel}` as MessageKey)}</button>
            ))}
          </div>
        </div>
        <p className="analytics-note">
          {t(variant === 'ENGLISH' ? 'learn.odds.european' : 'learn.odds.american')} {t('learn.odds.gap')}
        </p>
        <div className="table-scroll">
          <table className="summary-table odds-table">
            <thead><tr><th scope="col">{t('analytics.bets.bet')}</th><th scope="col">{t('learn.odds.covers')}</th><th scope="col">{t('learn.odds.pays')}</th><th scope="col">{t('learn.odds.chance')}</th><th scope="col">{t('learn.odds.edge')}</th></tr></thead>
            <tbody>
              {ODDS.filter(row => !row.americanOnly || variant === 'AMERICAN').map(row => {
                const chance = row.covers / pockets
                const edge = 1 - (PAYOUTS[row.type] + 1) * chance
                return (
                  <tr key={row.type} className={edge > 0.06 ? 'is-worst' : ''}>
                    <th scope="row">{t(`learn.odds.${row.type}.name` as MessageKey)}<small>{t(`learn.odds.${row.type}.example` as MessageKey)}</small></th>
                    <td>{row.covers}</td>
                    <td>{t('learn.odds.payout', { odds: PAYOUTS[row.type] })}</td>
                    <td>{percent(chance)}<small>{t('learn.odds.oneIn', { n: (pockets / row.covers).toFixed(1).replace(/\.0$/, '') })}</small></td>
                    <td>{percent(edge)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="analytics-note">
          {t(variant === 'ENGLISH' ? 'learn.odds.noteEuropean' : 'learn.odds.noteAmerican', { edge: percent(variant === 'ENGLISH' ? 1 / 37 : 2 / 38) })}
        </p>
      </section>

      <section id="systems" aria-labelledby="systems-heading">
        <h2 className="learn-section-title" id="systems-heading">{t('learn.systems.title')}</h2>
        <div className="guide-grid">
          {GUIDES.map(guide => (
            <article key={guide.id} className="guide-card">
              <header>
                <span className={`risk risk-${guide.risk}`}>{t(`learn.risk.${guide.risk}` as MessageKey)}</span>
                <h3>{t(guideText(guide.id, 'name'))}</h3>
                <p className="guide-tag">{t(guideText(guide.id, 'tag'))}</p>
              </header>
              <p>{t(guideText(guide.id, 'idea'))}</p>
              <ol>{Array.from({ length: guide.steps }, (_, i) => <li key={i}>{t(guideText(guide.id, `how.${i + 1}`))}</li>)}</ol>
              <p className="guide-catch"><strong>{t('learn.catch')}</strong> {t(guideText(guide.id, 'catch'))}</p>
              <button type="button" className="btn-ghost small" onClick={() => tryInLab(guide.id)}>{t('learn.tryLab')}</button>
            </article>
          ))}
        </div>
      </section>

      <StrategyLab strategy={labStrategy} onStrategy={setLabStrategy} />

      <section className="analytics-card" id="myths" aria-labelledby="myths-heading">
        <h2 id="myths-heading">{t('learn.myths.title')}</h2>
        <dl className="myths">
          {[1, 2, 3, 4].map(n => (
            <Fragment key={n}>
              <dt>{t(`learn.myth.${n}.q` as MessageKey)}</dt>
              <dd>{t(`learn.myth.${n}.a` as MessageKey)}</dd>
            </Fragment>
          ))}
        </dl>
        <p className="analytics-note">{t('learn.care')}</p>
      </section>
    </main>
  )
}
