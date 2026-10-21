/**
 * What a link opened in (or into) the game asks for. Kept free of browser and
 * Capacitor imports so it can be tested on its own and used for every way a
 * link arrives: the address bar, an app link or the roulette:// scheme.
 */
export type DeepLink =
  | { kind: 'join', code: string }
  | { kind: 'ref', code: string }

const TABLE_CODE = /^[A-Z0-9]{6}$/
const REFERRAL_CODE = /^[A-Z0-9]{7}$/

const path = { join: 'join', ref: 'r' } as const

function recognise (kind: DeepLink['kind'], value: string | null | undefined): DeepLink | null {
  const code = (value ?? '').trim().toUpperCase()
  return (kind === 'join' ? TABLE_CODE : REFERRAL_CODE).test(code) ? { kind, code } : null
}

/**
 * A table invite or referral link, from any of its shapes:
 *   https://site/join/ABC123   https://site/r/K7QM2XA   (shared links)
 *   https://site/?join=ABC123  https://site/?ref=K7QM2XA (what the shared link forwards to)
 *   roulette://join/ABC123     roulette://r/K7QM2XA      (the app's own scheme)
 * Anything else (including a bad code) is null.
 */
export function parseDeepLink (input: string): DeepLink | null {
  let url: URL
  try { url = new URL(input, 'https://roulette.invalid') } catch { return null }

  // With roulette://join/CODE the word after the slashes parses as the host, not the path.
  const segments = [...(url.protocol === 'http:' || url.protocol === 'https:' ? [] : [url.host]), ...url.pathname.split('/')].filter(Boolean)
  const [first, second] = segments
  if (segments.length === 2) {
    if (first.toLowerCase() === path.join) return recognise('join', second)
    if (first.toLowerCase() === path.ref) return recognise('ref', second)
  }
  return recognise('join', url.searchParams.get('join')) ?? recognise('ref', url.searchParams.get('ref'))
}

/** The address with a handled link taken out, so a reload doesn't act on it twice. */
export function withoutDeepLink (input: string): string {
  const url = new URL(input)
  url.searchParams.delete('join')
  url.searchParams.delete('ref')
  const onPath = /^\/(join|r)\/[A-Za-z0-9]+\/?$/.test(url.pathname)
  return (onPath ? '/' : url.pathname) + url.search + url.hash
}
