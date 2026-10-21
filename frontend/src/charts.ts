import { useLayoutEffect, useRef, useState } from 'react'

/** The rendered width of an element, kept up to date. */
export function useWidth<T extends HTMLElement> () {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** A bar rising from the baseline with 4px rounded top corners. */
export function roundedTop (x: number, base: number, width: number, height: number) {
  const r = Math.min(4, width / 2, height)
  const top = base - height
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${base}Z`
}

/** Keeps a tooltip centred on x without spilling out of a chart `width` wide. */
export const tooltipLeft = (x: number, width: number, half = 80) => Math.min(Math.max(x, half), width - half)

export const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString()}`
export const trend = (value: number) => value > 0 ? 'is-up' : value < 0 ? 'is-down' : ''
