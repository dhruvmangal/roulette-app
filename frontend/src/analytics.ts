import { inDiscord } from './discord'
import { onCrazyGames } from './crazygames'

/** The Google Analytics 4 measurement ID. Set VITE_GA_MEASUREMENT_ID to use another, or to an empty value to turn analytics off. */
const MEASUREMENT_ID: string = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) ?? 'G-QNNF20V4YE'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

const isLocal = () => /^(localhost|127\.0\.0\.1|\[::1\]|.*\.localhost|.*\.test)$/.test(window.location.hostname)

let started = false

/** Loads Google Analytics once, in the browser, for the real site only: not on localhost, and not inside Discord. */
function start (): boolean {
  if (started) return true
  if (!MEASUREMENT_ID || typeof window === 'undefined' || isLocal() || inDiscord || onCrazyGames) return false
  started = true
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag () { window.dataLayer!.push(arguments) } // eslint-disable-line prefer-rest-params
  window.gtag('js', new Date())
  // The game is a single page, so each screen reports its own page view (see trackPage).
  window.gtag('config', MEASUREMENT_ID, { send_page_view: false })
  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`
  document.head.appendChild(script)
  return true
}

/** A page view for the screen now showing. */
export function trackPage (path: string, title: string) {
  if (!start()) return
  window.gtag?.('event', 'page_view', { page_path: path, page_title: title, page_location: window.location.origin + path })
}

/** A named event, e.g. trackEvent('game_start', { game: 'plinko' }). Never put names, emails or balances in `params`. */
export function trackEvent (name: string, params: Record<string, string | number | boolean> = {}) {
  if (!start()) return
  window.gtag?.('event', name, params)
}
