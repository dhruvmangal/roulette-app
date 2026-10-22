import { useSyncExternalStore } from 'react'
import type { AppConfig } from '@roulette/contracts'
import { inDiscord } from '../discord'
import { onCrazyGames, showCrazyGamesAd } from '../crazygames'
import { apiOrigin, isNativeApp, platform } from '../platform'
import { adShown, AD_POLICY, FRESH_TRACKER, isAdDue, roundPlayed, type AdTracker } from './policy'

/**
 * Ads between rounds: an AdMob interstitial in the app, an AdSense unit in an
 * overlay on the web. Each is off until its ids are set at build time, so a
 * build without them never shows (or loads) anything.
 */
const env = import.meta.env
const ADSENSE_CLIENT: string | undefined = env.VITE_ADSENSE_CLIENT
const ADSENSE_SLOT: string | undefined = env.VITE_ADSENSE_SLOT
// Google's sample interstitial units: dev builds show test ads only. Real units are for release builds.
const TEST_UNIT = platform === 'ios' ? 'ca-app-pub-3940256099942544/4411468910' : 'ca-app-pub-3940256099942544/1033173712'
const ADMOB_UNIT: string | undefined = (platform === 'ios' ? env.VITE_ADMOB_INTERSTITIAL_IOS : env.VITE_ADMOB_INTERSTITIAL_ANDROID) ?? (env.PROD ? undefined : TEST_UNIT)

export const adsEnabled = onCrazyGames || (!inDiscord && (isNativeApp ? Boolean(ADMOB_UNIT) : Boolean(ADSENSE_CLIENT && ADSENSE_SLOT)))
export const adsense = { client: ADSENSE_CLIENT ?? '', slot: ADSENSE_SLOT ?? '' }

let tracker: AdTracker = FRESH_TRACKER
let busy = false

// The admin's switch for this platform. Read from the server and kept for a few minutes;
// if the server can't be reached the answer is no ads, so a switched-off ad never shows by accident.
const CONFIG_TTL_MS = 5 * 60_000
let switchedOn: { value: boolean, at: number } | null = null
let loading: Promise<boolean> | null = null

function adsSwitchedOn (): Promise<boolean> {
  if (switchedOn && Date.now() - switchedOn.at < CONFIG_TTL_MS) return Promise.resolve(switchedOn.value)
  loading ??= (async () => {
    try {
      const response = await fetch(`${apiOrigin}/api/v1/config`, { signal: AbortSignal.timeout(5000) })
      const { data } = await response.json() as { data?: { config?: AppConfig } }
      const ads = data?.config?.ads
      return response.ok && ads ? Boolean(isNativeApp ? ads.app : ads.web) : false
    } catch {
      return false
    }
  })().then(value => { switchedOn = { value, at: Date.now() }; return value }).finally(() => { loading = null })
  return loading
}

/** A round the player took part in has finished. */
export function recordRound () {
  tracker = roundPlayed(tracker)
}

// The web overlay's state, read by <AdHost>.
let webAdOpen = false
let closeWebAd: (() => void) | null = null
const listeners = new Set<() => void>()
const setWebAd = (open: boolean) => { webAdOpen = open; listeners.forEach(listener => listener()) }
export const useWebAdOpen = () => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => webAdOpen)

/** Called by the overlay when the player closes it. */
export function dismissWebAd () {
  closeWebAd?.()
}

let nativeReady: Promise<typeof import('@capacitor-community/admob').AdMob> | null = null
function nativeAdMob () {
  nativeReady ??= (async () => {
    const { AdMob, AdmobConsentStatus } = await import('@capacitor-community/admob')
    // Consent (EU/UK) and App Tracking Transparency prompts come before the first ad request.
    const consent = await AdMob.requestConsentInfo().catch(() => null)
    if (consent?.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) await AdMob.showConsentForm().catch(() => {})
    await AdMob.initialize({ initializeForTesting: !env.PROD })
    return AdMob
  })()
  nativeReady.catch(() => { nativeReady = null })
  return nativeReady
}

/** Starts loading the next ad so it is ready when a round ends. */
export function warmUpAds () {
  if (!adsEnabled || onCrazyGames) return
  const unit = ADMOB_UNIT
  const on = adsSwitchedOn()
  if (!isNativeApp || !unit) return
  void on.then(async allowed => {
    if (!allowed) return
    const AdMob = await nativeAdMob()
    await AdMob.prepareInterstitial({ adId: unit, isTesting: !env.PROD })
  }).catch(() => {})
}

async function showNative (): Promise<boolean> {
  if (!ADMOB_UNIT) return false
  const AdMob = await nativeAdMob()
  await AdMob.prepareInterstitial({ adId: ADMOB_UNIT, isTesting: !env.PROD })
  const dismissed = new Promise<void>(resolve => {
    void AdMob.addListener('interstitialAdDismissed' as never, () => resolve())
    void AdMob.addListener('interstitialAdFailedToShow' as never, () => resolve())
    // A stuck ad must not hold the table forever.
    window.setTimeout(resolve, 60_000)
  })
  await AdMob.showInterstitial()
  await dismissed
  return true
}

/**
 * Shows an ad if one is due. Resolves when it has been closed (or at once if none
 * was shown). Fail-open: any error means no ad and the game carries on.
 */
export async function maybeShowAd (): Promise<void> {
  if (!adsEnabled || busy || !isAdDue(tracker, Date.now(), AD_POLICY)) return
  busy = true
  try {
    if (onCrazyGames) {
      // Their SDK decides whether an ad can run; the game waits for it to end.
      if (await showCrazyGamesAd()) tracker = adShown(Date.now())
    } else if (!await adsSwitchedOn()) {
      return
    } else if (isNativeApp) {
      if (await showNative()) tracker = adShown(Date.now())
    } else {
      await new Promise<void>(resolve => {
        closeWebAd = () => { closeWebAd = null; setWebAd(false); resolve() }
        setWebAd(true)
      })
      tracker = adShown(Date.now())
    }
  } catch {
    // Ad failed to load or show: skip it, and retry after the next round.
  } finally {
    busy = false
  }
}
