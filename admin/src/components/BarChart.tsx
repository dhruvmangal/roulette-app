import { useMemo, useRef, useState } from 'react'
import { compact } from '../format'

export interface Series { key: string, label: string, color: string }

interface Props {
  title: string
  subtitle?: string
  rows: Array<Record<string, number | string>>
  /** The row field holding each column's category label. */
  category: string
  formatCategory?: (value: string) => string
  series: Series[]
  /** For one signed series: columns below zero take this color. */
  negativeColor?: string
  height?: number
}

const PAD = { top: 12, right: 8, bottom: 26, left: 44 }
const MAX_BAR = 24
const GAP = 2

/** Clean tick steps: 1, 2 or 5 times a power of ten. */
function ticks (min: number, max: number, count = 4) {
  if (min === max) max = min + 1
  const raw = (max - min) / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map(m => m * power).find(s => s >= raw) ?? raw
  const start = Math.floor(min / step) * step
  const values: number[] = []
  for (let v = start; v <= max + step * 0.5; v += step) values.push(Math.round(v * 1e6) / 1e6)
  return values
}

/**
 * Columns grouped by category, one per series, from a single zero baseline.
 * Hovering a category shows every series' value for it.
 */
export function BarChart ({ title, subtitle, rows, category, formatCategory = String, series, negativeColor, height = 200 }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const [width, setWidth] = useState(640)
  const observer = useRef<ResizeObserver | null>(null)
  const measure = (node: HTMLDivElement | null) => {
    observer.current?.disconnect()
    if (!node) return
    observer.current = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)))
    observer.current.observe(node)
  }

  const { scale, tickValues } = useMemo(() => {
    const values = rows.flatMap(row => series.map(s => Number(row[s.key])))
    const tickValues = ticks(Math.min(0, ...values), Math.max(0, ...values))
    const lo = tickValues[0]
    const hi = tickValues[tickValues.length - 1]
    const plot = height - PAD.top - PAD.bottom
    return { tickValues, scale: (v: number) => PAD.top + plot - ((v - lo) / (hi - lo)) * plot }
  }, [rows, series, height])

  const band = (width - PAD.left - PAD.right) / Math.max(1, rows.length)
  const bar = Math.min(MAX_BAR, (band * 0.7 - GAP * (series.length - 1)) / series.length)
  const groupWidth = bar * series.length + GAP * (series.length - 1)
  const zero = scale(0)
  const labelEvery = Math.ceil(rows.length / Math.max(1, Math.floor((width - PAD.left) / 56)))

  const column = (x: number, value: number) => {
    const top = scale(Math.max(value, 0))
    const bottom = scale(Math.min(value, 0))
    const h = Math.max(bottom - top, value === 0 ? 0 : 1)
    const r = Math.min(4, h, bar / 2)
    // Rounded at the data end, square at the baseline.
    return value >= 0
      ? `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + bar - r} Q${x + bar},${top} ${x + bar},${top + r} V${top + h} Z`
      : `M${x},${top} V${top + h - r} Q${x},${top + h} ${x + r},${top + h} H${x + bar - r} Q${x + bar},${top + h} ${x + bar},${top + h - r} V${top} Z`
  }

  const hovered = hover === null ? null : rows[hover]
  const tipLeft = hover === null ? 0 : Math.min(Math.max(PAD.left + band * hover + band / 2, 90), width - 90)

  return (
    <figure className='chart'>
      <figcaption>
        <div className='chart-title'>{title}</div>
        {subtitle && <div className='chart-subtitle'>{subtitle}</div>}
        {series.length > 1 && (
          <ul className='legend'>
            {series.map(s => <li key={s.key}><span className='swatch' style={{ background: s.color }} />{s.label}</li>)}
          </ul>
        )}
      </figcaption>
      <div className='chart-plot' ref={measure} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={height} role='img' aria-label={title}>
          {tickValues.map(t => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={scale(t)} y2={scale(t)} className={t === 0 ? 'axis-base' : 'grid'} />
              <text x={PAD.left - 8} y={scale(t)} className='tick' textAnchor='end' dominantBaseline='middle'>{compact(t)}</text>
            </g>
          ))}
          {rows.map((row, i) => {
            const x0 = PAD.left + band * i + (band - groupWidth) / 2
            return (
              <g key={String(row[category])}>
                {hover === i && <rect x={PAD.left + band * i} y={PAD.top} width={band} height={height - PAD.top - PAD.bottom} className='hover-band' />}
                {series.map((s, j) => {
                  const value = Number(row[s.key])
                  const color = negativeColor && value < 0 ? negativeColor : s.color
                  return <path key={s.key} d={column(x0 + j * (bar + GAP), value)} fill={color} />
                })}
                {i % labelEvery === 0 && (
                  <text x={PAD.left + band * i + band / 2} y={height - 8} className='tick' textAnchor='middle'>{formatCategory(String(row[category]))}</text>
                )}
                <rect x={PAD.left + band * i} y={0} width={band} height={height} fill='transparent' onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
              </g>
            )
          })}
          <line x1={PAD.left} x2={width - PAD.right} y1={zero} y2={zero} className='axis-base' />
        </svg>
        {hovered && (
          <div className='tooltip' style={{ left: tipLeft }}>
            <div className='tooltip-title'>{formatCategory(String(hovered[category]))}</div>
            {series.map(s => {
              const value = Number(hovered[s.key])
              return (
                <div key={s.key} className='tooltip-row'>
                  <span className='swatch' style={{ background: negativeColor && value < 0 ? negativeColor : s.color }} />
                  <span>{s.label}</span>
                  <strong>{value.toLocaleString('en-US')}</strong>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <details className='chart-table'>
        <summary>Show as table</summary>
        <table>
          <thead><tr><th>Day</th>{series.map(s => <th key={s.key} className='num'>{s.label}</th>)}</tr></thead>
          <tbody>
            {rows.map(row => (
              <tr key={String(row[category])}>
                <td>{formatCategory(String(row[category]))}</td>
                {series.map(s => <td key={s.key} className='num'>{Number(row[s.key]).toLocaleString('en-US')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
