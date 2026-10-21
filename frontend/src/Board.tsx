import { useMemo, useState, type CSSProperties } from 'react'
import { coveredPockets, tableLayout, type BetSelection, type Pocket, type VariantName } from '@roulette/engine'
import { betKey, betLabel } from './game'

interface Props {
  variant: VariantName
  amounts: ReadonlyMap<string, number>
  /** Other seats' stakes, shown as small chips in their seat colour. */
  others?: readonly OtherStake[]
  disabled: boolean
  winningPocket: Pocket | null
  onBet: (selection: BetSelection) => void
}

export interface OtherStake { key: string, seat: number }

/** Each seat's marker sits at its own point on a ring around the bet spot, so stakes never stack. */
const ringOffset = (seat: number) => {
  const angle = ((seat - 1) / 8) * 2 * Math.PI - Math.PI / 2
  return { '--dx': `${(Math.cos(angle) * 2.6).toFixed(2)}cqw`, '--dy': `${(Math.sin(angle) * 2.6).toFixed(2)}cqw` } as CSSProperties
}

const formatChip = (amount: number) => amount >= 1000 ? `${+(amount / 1000).toFixed(1)}k` : String(amount)

export function Board ({ variant, amounts, others = [], disabled, winningPocket, onBet }: Props) {
  const layout = tableLayout(variant)
  const { bounds } = layout
  const [hovered, setHovered] = useState<ReadonlySet<Pocket>>(new Set())

  const place = (x: number, y: number, width = 0, height = 0): CSSProperties => ({
    left: `${((x - bounds.x) / bounds.width) * 100}%`,
    top: `${((y - bounds.y) / bounds.height) * 100}%`,
    width: width ? `${(width / bounds.width) * 100}%` : undefined,
    height: height ? `${(height / bounds.height) * 100}%` : undefined
  })

  // Where each bet's chip stack sits on the felt.
  const anchors = useMemo(() => {
    const map = new Map<string, { x: number, y: number }>()
    for (const spot of layout.insideSpots) map.set(betKey(spot), { x: spot.x, y: spot.y })
    for (const area of layout.outsideAreas) map.set(betKey(area as BetSelection), { x: area.x + area.width / 2, y: area.y + area.height / 2 })
    return map
  }, [layout])

  const targetProps = (selection: BetSelection) => ({
    disabled,
    'aria-label': betLabel(selection),
    onClick: () => onBet(selection),
    onPointerEnter: () => setHovered(new Set(coveredPockets(variant, selection))),
    onPointerLeave: () => setHovered(new Set()),
    onFocus: () => setHovered(new Set(coveredPockets(variant, selection))),
    onBlur: () => setHovered(new Set())
  })

  // The frame lets a phone in portrait turn the board upright in CSS (see style.css),
  // so the layout and hit areas stay the engine's.
  const frameSize = { '--board-w': bounds.width, '--board-h': bounds.height } as CSSProperties
  return (
    <div className="board-frame" style={frameSize}>
    <div className={`board${disabled ? ' is-locked' : ''}`} style={{ aspectRatio: `${bounds.width} / ${bounds.height}` }}>
      {layout.cells.map(cell => (
        <button
          key={cell.pocket}
          type="button"
          className={`cell cell-${cell.color}${hovered.has(cell.pocket) ? ' is-covered' : ''}${winningPocket === cell.pocket ? ' is-winner' : ''}`}
          style={place(cell.x, cell.y, cell.width, cell.height)}
          {...targetProps({ type: 'STRAIGHT', pockets: [cell.pocket] })}
        >
          <span>{cell.pocket}</span>
        </button>
      ))}
      {layout.outsideAreas.map(area => {
        const selection = area as BetSelection
        return (
          <button
            key={betKey(selection)}
            type="button"
            className={`outside outside-${area.type.toLowerCase()}`}
            style={place(area.x, area.y, area.width, area.height)}
            {...targetProps(selection)}
          >
            {area.type === 'RED' || area.type === 'BLACK' ? <i className="diamond" /> : area.label}
          </button>
        )
      })}
      {layout.insideSpots.filter(spot => spot.type !== 'STRAIGHT').map(spot => (
        <button
          key={betKey(spot)}
          type="button"
          className="spot"
          style={place(spot.x, spot.y)}
          {...targetProps({ type: spot.type, pockets: spot.pockets })}
        />
      ))}
      {others.map(({ key, seat }) => {
        const anchor = anchors.get(key)
        return anchor && (
          <span key={`${seat}:${key}`} className={`seat-chip seat-${seat}`} style={{ ...place(anchor.x, anchor.y), ...ringOffset(seat) }} />
        )
      })}
      {[...amounts].map(([key, amount]) => {
        const anchor = anchors.get(key)
        return anchor && <span key={key} className="placed-chip" style={place(anchor.x, anchor.y)}>{formatChip(amount)}</span>
      })}
    </div>
    </div>
  )
}
