import { useEffect, useState, type ReactNode } from 'react'
import { pocketColor } from '@roulette/engine'
import type { PlayerStats, StatsPeriod } from '@roulette/contracts'
import { useI18n } from './i18n'
import { errorMessage, useSession } from './session'
import { roundedTop, signed, tooltipLeft, trend, useWidth } from './charts'

const PERIODS: StatsPeriod[] = ['week', 'month', 'all']

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
const PERCENT: Intl.NumberFormatOptions = { style: 'percent', maximumFractionDigits: 1 }
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`
// 'YYYY-MM-DD' as a local date, so the label doesn't drift a day west of UTC.
const parseDay = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d) }

function Tile ({ label, value, note, tone = '' }: { label: string, value: ReactNode, note?: ReactNode, tone?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <strong className={`stat-value ${tone}`}>{value}</strong>
      {note && <small className="stat-note">{note}</small>}
    </div>
  )
}

/** Running net over the period, one point per day played, with a crosshair tooltip. */
function NetChart ({ daily }: { daily: PlayerStats['daily'] }) {
  const { t, date } = useI18n()
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 200
  const pad = { top: 16, right: 12, bottom: 24, left: 56 }

  let running = 0
  const points = [{ day: null as string | null, net: 0, change: 0, rounds: 0 }, ...daily.map(row => ({ day: row.day, net: (running += row.net), change: row.net, rounds: row.rounds }))]
  const values = points.map(point => point.net)
  const max = Math.max(0, ...values)
  const min = Math.min(0, ...values)
  const span = max - min || 1
  const plotWidth = Math.max(0, width - pad.left - pad.right)
  const x = (index: number) => pad.left + (points.length > 1 ? index / (points.length - 1) : 0.5) * plotWidth
  const y = (value: number) => pad.top + (max - value) / span * (height - pad.top - pad.bottom)
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.net).toFixed(1)}`).join('')
  const last = points[points.length - 1]
  const active = hover === null ? null : points[hover]

  function track (event: React.PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - box.left) / box.width
    setHover(Math.max(1, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))))
  }

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={t('analytics.net.aria', { value: signed(last.net) })}>
          {[max, 0, min].filter((value, index, all) => all.indexOf(value) === index).map(value => (
            <g key={value}>
              <line className={value === 0 ? 'chart-baseline' : 'chart-grid'} x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} />
              <text className="chart-axis" x={pad.left - 8} y={y(value) + 4} textAnchor="end">{signed(value)}</text>
            </g>
          ))}
          {daily.length > 0 && (
            <>
              <text className="chart-axis" x={x(1)} y={height - 6} textAnchor={daily.length > 1 ? 'start' : 'middle'}>{date(parseDay(daily[0].day), DAY_MONTH)}</text>
              {daily.length > 1 && <text className="chart-axis" x={x(points.length - 1)} y={height - 6} textAnchor="end">{date(parseDay(last.day!), DAY_MONTH)}</text>}
            </>
          )}
          <path className="chart-line" d={path} />
          <circle className="chart-dot" cx={x(points.length - 1)} cy={y(last.net)} r={4} />
          {active && hover !== null && (
            <>
              <line className="chart-crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={height - pad.bottom} />
              <circle className="chart-dot" cx={x(hover)} cy={y(active.net)} r={5} />
            </>
          )}
          <rect x={pad.left} y={0} width={plotWidth} height={height} fill="transparent" onPointerMove={track} onPointerDown={track} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {active?.day && hover !== null && (
        <div className="chart-tooltip" style={{ left: tooltipLeft(x(hover), width), top: 0 }}>
          <strong>{date(parseDay(active.day), DAY_MONTH)}</strong>
          <span>{t('analytics.net.day')} <b className={trend(active.change)}>{signed(active.change)}</b> · {t('analytics.rounds', { count: active.rounds })}</span>
          <span>{t('analytics.net.running')} <b className={trend(active.net)}>{signed(active.net)}</b></span>
        </div>
      )}
    </div>
  )
}

/** Rounds played in each hour of the day. */
function HourChart ({ hours }: { hours: number[] }) {
  const { t } = useI18n()
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const height = 120
  const bottom = 20
  const max = Math.max(1, ...hours)
  const slot = width / 24
  const bar = Math.max(2, slot - 2)
  const busiest = hours.indexOf(Math.max(...hours))

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={t('analytics.hours.aria', { hour: hourLabel(busiest) })} onPointerLeave={() => setHover(null)}>
          <line className="chart-baseline" x1={0} x2={width} y1={height - bottom} y2={height - bottom} />
          {hours.map((rounds, hour) => {
            const barHeight = rounds ? Math.max(4, rounds / max * (height - bottom - 8)) : 0
            return (
              <g key={hour} onPointerEnter={() => setHover(hour)} onPointerDown={() => setHover(hour)}>
                <rect x={hour * slot} y={0} width={slot} height={height} fill="transparent" />
                {rounds > 0 && <path className={`chart-bar${hover === hour ? ' is-hover' : ''}`} d={roundedTop(hour * slot + 1, height - bottom, bar, barHeight)} />}
              </g>
            )
          })}
          {[0, 6, 12, 18].map(hour => <text key={hour} className="chart-axis" x={hour * slot + 1} y={height - 4}>{hourLabel(hour)}</text>)}
        </svg>
      )}
      {hover !== null && (
        <div className="chart-tooltip" style={{ left: tooltipLeft((hover + 0.5) * slot, width, 70), top: 0 }}>
          <strong>{hourLabel(hover)}–{hourLabel((hover + 1) % 24)}</strong>
          <span>{t('analytics.hours.rounds', { count: hours[hover] })}</span>
        </div>
      )}
    </div>
  )
}

function BetTypes ({ rows }: { rows: PlayerStats['betTypes'] }) {
  const { t, number } = useI18n()
  const most = Math.max(...rows.map(row => row.staked))
  return (
    <div className="table-scroll">
    <table className="summary-table bet-mix">
      <thead><tr><th scope="col">{t('analytics.bets.bet')}</th><th scope="col">{t('analytics.bets.staked')}</th><th scope="col">{t('analytics.bets.hitRate')}</th><th scope="col">{t('analytics.bets.net')}</th></tr></thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.betType} title={`${row.bets} · ${row.wins} · ${number(row.staked)} → ${number(row.returned)}`}>
            <th scope="row">{t(`bet.${row.betType}`)}</th>
            <td>
              <span className="mix-cell">
                <span className="mix-track"><span className="mix-bar" style={{ width: `${Math.max(2, row.staked / most * 100)}%` }} /></span>
                <span className="mix-value">{number(row.staked)}</span>
              </span>
            </td>
            <td>{number(row.wins / row.bets, PERCENT)} <small>{t('analytics.bets.of', { count: row.bets })}</small></td>
            <td className={trend(row.net)}>{signed(row.net)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
}

/** Net chips as bars either side of zero: yours in gold, the alternatives in grey. */
function WhatIf ({ stats }: { stats: PlayerStats }) {
  const { t } = useI18n()
  const rows = [
    { id: 'actual', label: t('analytics.whatIf.actual'), net: stats.summary.net, mine: true },
    ...stats.whatIf.map(entry => ({ id: entry.what, label: t(`analytics.whatIf.${entry.what}`), net: entry.net, mine: false }))
  ]
  const reach = Math.max(1, ...rows.map(row => Math.abs(row.net)))
  return (
    <section className="analytics-card">
      <h2>{t('analytics.whatIf.title')}</h2>
      <p className="analytics-note">{t('analytics.whatIf.lede')}</p>
      <ul className="whatif">
        {rows.map(row => (
          <li key={row.id} className={row.mine ? 'is-mine' : ''}>
            <span className="whatif-label">{row.label}</span>
            <span className="whatif-track" aria-hidden="true">
              <span className="whatif-zero" />
              <span className={`whatif-bar ${row.net >= 0 ? 'is-positive' : 'is-negative'}`} style={{ width: `${Math.max(1, Math.abs(row.net) / reach * 50)}%` }} />
            </span>
            <b className={trend(row.net)}>{signed(row.net)}</b>
          </li>
        ))}
      </ul>
      <p className="analytics-note">{t('analytics.whatIf.note')}</p>
    </section>
  )
}

/** Where the player stands among the others, in totals only. */
function Community ({ stats }: { stats: PlayerStats }) {
  const { t, number } = useI18n()
  const crowd = stats.community
  if (!crowd) {
    return (
      <section className="analytics-card">
        <h2>{t('analytics.community.title')}</h2>
        <p className="analytics-note">{t('analytics.community.none', { min: 5 })}</p>
      </section>
    )
  }
  const meters = [
    { id: 'net', label: t('analytics.community.net'), share: crowd.netBeaten },
    { id: 'return', label: t('analytics.community.return'), share: crowd.returnBeaten }
  ]
  return (
    <section className="analytics-card">
      <h2>{t('analytics.community.title')}</h2>
      <p className="analytics-note">{t('analytics.community.lede', { players: number(crowd.players), min: crowd.minRounds })}</p>
      <div className="percentiles">
        {meters.map(meter => meter.share !== null && (
          <div key={meter.id} className="percentile">
            <span className="stat-label">{meter.label}</span>
            <span className="percentile-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meter.share * 100)} aria-label={meter.label}>
              <span style={{ width: `${Math.max(2, meter.share * 100)}%` }} />
            </span>
            <small>{t('analytics.community.ahead', { percent: number(meter.share, { style: 'percent', maximumFractionDigits: 0 }) })}</small>
          </div>
        ))}
      </div>
      <p className="analytics-note">
        {t('analytics.community.typical', { rounds: t('analytics.rounds', { count: crowd.medianRounds }), stake: number(crowd.medianStake), net: signed(crowd.medianNet) })}
      </p>
    </section>
  )
}

/** The player's betting habits at online tables: what they bet, how it paid, how it compares, and when they play. */
export function AnalyticsScreen () {
  const { api } = useSession()
  const { t, rich, number } = useI18n()
  const [period, setPeriod] = useState<StatsPeriod>('month')
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStats(null)
    setError(null)
    api.stats(period, timeZone).then(next => { if (!cancelled) setStats(next) }).catch(failure => { if (!cancelled) setError(errorMessage(failure)) })
    return () => { cancelled = true }
  }, [api, period])

  const s = stats?.summary
  const luck = s ? s.net - s.expectedNet : 0
  const previous = stats?.previous
  const percent = (value: number) => number(value, PERCENT)
  /** A line under a tile saying what it was the period before. */
  const before = (value: string) => previous && t('analytics.previous', { period: t(`period.${period}`), value })
  const previousReturn = previous?.returnRate ?? null

  return (
    <main className="page analytics">
      <section className="page-head">
        <p className="eyebrow">{t('analytics.eyebrow')}</p>
        <h1 className="page-title">{t('analytics.titleA')} <em>{t('analytics.titleB')}</em></h1>
        <p className="lede">{t('analytics.lede')}</p>
        <div className="view-switch" role="tablist" aria-label={t('analytics.period')}>
          {PERIODS.map(option => (
            <button key={option} type="button" role="tab" aria-selected={period === option} className={period === option ? 'is-active' : ''} onClick={() => setPeriod(option)}>
              {t(`period.${option}`)}
            </button>
          ))}
        </div>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!stats && !error && <p className="dialog-copy">{t('analytics.loading')}</p>}
      {stats && s && (s.rounds === 0
        ? <p className="dialog-copy">{t('analytics.empty')}</p>
        : (
          <>
            <div className="stat-grid">
              <Tile
                label={t('analytics.tile.net')}
                value={signed(s.net)}
                tone={trend(s.net)}
                note={<>{t('analytics.tile.netNote', { rounds: t('analytics.rounds', { count: s.rounds }), tables: t('analytics.tables', { count: s.tables }) })}{previous && <><br />{before(signed(previous.net))}</>}</>}
              />
              <Tile
                label={t('analytics.tile.roundsWon')}
                value={percent(s.roundsWon / s.rounds)}
                note={<>{t('analytics.tile.roundsWonNote', { up: s.roundsWon, down: s.roundsLost })}{previous && previous.rounds > 0 && <><br />{before(percent(previous.roundsWon / previous.rounds))}</>}</>}
              />
              <Tile
                label={t('analytics.tile.staked')}
                value={number(s.staked)}
                note={<>{t('analytics.tile.stakedNote', { average: number(s.averageStake) })}{previous && <><br />{before(number(previous.staked))}</>}</>}
              />
              <Tile
                label={t('analytics.tile.return')}
                value={s.returnRate === null ? '—' : percent(s.returnRate)}
                note={<>{t('analytics.tile.returnNote')}{previousReturn !== null && <><br />{before(percent(previousReturn))}</>}</>}
              />
              <Tile label={t('analytics.tile.best')} value={signed(s.biggestWin)} tone={trend(s.biggestWin)} />
              <Tile label={t('analytics.tile.worst')} value={signed(s.biggestLoss)} tone={trend(s.biggestLoss)} />
            </div>

            <section className="analytics-card luck">
              <h2>{t('analytics.luck.title')}</h2>
              <p>
                {rich(luck >= 0 ? 'analytics.luck.luckier' : 'analytics.luck.unluckier', {
                  expected: <b className="is-down">{signed(s.expectedNet)}</b>,
                  actual: <b className={trend(s.net)}>{signed(s.net)}</b>,
                  amount: <b className={trend(luck)}>{number(Math.abs(luck))}</b>
                })}
              </p>
              <small>{t('analytics.luck.note')}</small>
            </section>

            <div className="analytics-columns is-even">
              <WhatIf stats={stats} />
              <Community stats={stats} />
            </div>

            <section className="analytics-card">
              <h2>{t('analytics.net.title')}</h2>
              <NetChart daily={stats.daily} />
            </section>

            <div className="analytics-columns">
              <section className="analytics-card">
                <h2>{t('analytics.bets.title')}</h2>
                {s.insideShare !== null && (
                  <p className="analytics-note">
                    {t(s.insideShare >= 0.5 ? 'analytics.bets.inside' : 'analytics.bets.outside', { share: percent(s.insideShare) })}
                  </p>
                )}
                <BetTypes rows={stats.betTypes} />
              </section>

              <section className="analytics-card">
                <h2>{t('analytics.hours.title')}</h2>
                <HourChart hours={stats.roundsByHour} />
                <p className="analytics-note">{t('analytics.hours.in', { zone: stats.timeZone.replace(/_/g, ' ') })}</p>

                <h2>{t('analytics.streaks.title')}</h2>
                <div className="stat-grid compact">
                  <Tile label={t('analytics.streaks.win')} value={stats.streaks.longestWin} note={t('analytics.streaks.inARow')} />
                  <Tile label={t('analytics.streaks.loss')} value={stats.streaks.longestLoss} note={t('analytics.streaks.inARow')} />
                  <Tile
                    label={t('analytics.streaks.now')}
                    value={stats.streaks.current ? t(stats.streaks.current.kind === 'WIN' ? 'analytics.streaks.up' : 'analytics.streaks.down', { count: stats.streaks.current.length }) : '—'}
                    tone={stats.streaks.current?.kind === 'WIN' ? 'is-up' : stats.streaks.current ? 'is-down' : ''}
                  />
                </div>

                {stats.favouriteNumbers.length > 0 && (
                  <>
                    <h2>{t('analytics.numbers.title')}</h2>
                    <ol className="favourite-numbers">
                      {stats.favouriteNumbers.map(favourite => (
                        <li key={favourite.pocket}>
                          <span className={`history-pocket pocket-${pocketColor(favourite.pocket)}`}>{favourite.pocket}</span>
                          <small>{t('analytics.numbers.line', { bets: favourite.bets, count: favourite.hits })}</small>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </section>
            </div>
          </>
          )
      )}
    </main>
  )
}
