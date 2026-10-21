import { App as NativeApp } from '@capacitor/app'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Network } from '@capacitor/network'
import { Share } from '@capacitor/share'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { parseDeepLink, type DeepLink } from './deepLink'
import { getPreferences } from './preferences'
import { isNativeApp, platform } from './platform'

/** Native look and feel once the first screen is up. Does nothing in a browser. */
export async function startNative () {
  if (!isNativeApp) return
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  if (platform === 'android') await StatusBar.setBackgroundColor({ color: '#07070b' }).catch(() => {})
  await SplashScreen.hide().catch(() => {})
}

/** A light tap, e.g. a chip landing on the felt. */
export function tapFeedback () {
  if (isNativeApp && getPreferences().haptics) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
}

/** A win (or a big win) buzz. */
export function winFeedback (big: boolean) {
  if (isNativeApp && getPreferences().haptics) void Haptics.notification({ type: big ? NotificationType.Success : NotificationType.Warning }).catch(() => {})
}

/**
 * The Android back button. `handle` returns true when it dealt with the press
 * (closed a dialog, left a table); otherwise the app goes to the background,
 * as Android apps do from their home screen.
 */
export function onBackButton (handle: () => boolean): () => void {
  if (!isNativeApp) return () => {}
  const listener = NativeApp.addListener('backButton', () => {
    if (!handle()) void NativeApp.minimizeApp()
  })
  return () => { void listener.then(registered => registered.remove()) }
}

/**
 * Calls `handle` for each invite or referral link that opens the app: an app
 * link (https://site/join/CODE), the roulette:// scheme, or the link the app
 * was launched with. Does nothing in a browser, which reads its own address.
 */
export function onAppLink (handle: (link: DeepLink) => void): () => void {
  if (!isNativeApp) return () => {}
  // A cold start can announce the same link twice (launch URL and the open event).
  let last = { url: '', at: 0 }
  const open = (url?: string) => {
    const link = url ? parseDeepLink(url) : null
    if (!link || (url === last.url && Date.now() - last.at < 3000)) return
    last = { url: url as string, at: Date.now() }
    handle(link)
  }
  void NativeApp.getLaunchUrl().then(launch => open(launch?.url)).catch(() => {})
  const listener = NativeApp.addListener('appUrlOpen', ({ url }) => open(url))
  return () => { void listener.then(registered => registered.remove()) }
}

/** Calls `onActive` whenever the app (or browser tab) comes back to the foreground. */
export function onForeground (onActive: () => void): () => void {
  if (isNativeApp) {
    const listener = NativeApp.addListener('appStateChange', ({ isActive }) => { if (isActive) onActive() })
    return () => { void listener.then(registered => registered.remove()) }
  }
  const visible = () => { if (document.visibilityState === 'visible') onActive() }
  document.addEventListener('visibilitychange', visible)
  return () => document.removeEventListener('visibilitychange', visible)
}

/** Calls `onChange` with the connection state now and whenever it changes. */
export function watchNetwork (onChange: (online: boolean) => void): () => void {
  void Network.getStatus().then(status => onChange(status.connected)).catch(() => {})
  const listener = Network.addListener('networkStatusChange', status => onChange(status.connected))
  return () => { void listener.then(registered => registered.remove()) }
}

/** Whether a system share sheet (WhatsApp, Instagram, Messages, …) is available here. */
export const canShare = isNativeApp || typeof navigator.share === 'function'

const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

/**
 * Opens the system share sheet with a message (link included) and, where the platform can
 * attach one, a picture. Resolves false if the player closed it without
 * sharing or there is no share sheet.
 */
export async function shareSheet ({ title, text, image }: { title: string, text: string, image?: { blob: Blob, name: string } }): Promise<boolean> {
  try {
    if (isNativeApp) {
      // The share sheet takes files by path, so the picture goes to the cache first.
      const file = image
        ? await Filesystem.writeFile({ path: image.name, data: await toBase64(image.blob), directory: Directory.Cache }).catch(() => null)
        : null
      await Share.share({ title, text, ...(file && { files: [file.uri] }), dialogTitle: title })
      return true
    }
    if (typeof navigator.share !== 'function') return false
    const files = image ? [new File([image.blob], image.name, { type: image.blob.type })] : []
    // The link is in the text, not a separate url, which some apps would add a second time;
    // with a picture, apps use the text as its caption.
    if (files.length && navigator.canShare?.({ files })) await navigator.share({ title, text, files })
    else await navigator.share({ title, text })
    return true
  } catch {
    return false
  }
}
