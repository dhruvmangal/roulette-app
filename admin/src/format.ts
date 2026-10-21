const number = new Intl.NumberFormat('en-US')
const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const dateTime = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

export const chips = (value: number | null | undefined) => (value == null ? '—' : number.format(value))
export const compact = (value: number) => (Math.abs(value) < 10000 ? number.format(value) : compactFormat.format(value))
export const signed = (value: number) => (value > 0 ? `+${number.format(value)}` : number.format(value))
export const when = (value: string | null | undefined) => (value ? dateTime.format(new Date(value)) : '—')
export const day = (isoDate: string) => dayMonth.format(new Date(`${isoDate}T00:00:00`))

export function ago (value: string | null | undefined) {
  if (!value) return 'never'
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const units: Array<[number, string]> = [[60, 'min'], [3600, 'h'], [86400, 'd'], [2592000, 'mo'], [31536000, 'y']]
  let label = ''
  for (const [size, unit] of units) if (seconds >= size) label = `${Math.floor(seconds / size)}${unit === 'min' ? ' min' : unit}`
  return `${label} ago`
}

/** "1 round", "3 rounds" */
export const plural = (count: number, noun: string) => `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`

/** The wheel's name; ENGLISH is the single-zero wheel, shown as European. */
export const variantName = (variant: string) => (variant === 'AMERICAN' ? 'American' : variant === 'ENGLISH' ? 'European' : variant)

export const label = (code: string) => code.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())
