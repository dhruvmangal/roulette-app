import { onCrazyGames } from './crazygames'
import { inDiscord } from './discord'
import { isNativeApp } from './platform'

/**
 * Registers the service worker that makes the site installable and keeps its files on the device.
 * Not in dev (it would serve stale modules), inside the iOS/Android app, a Discord Activity or CrazyGames.
 */
export function registerServiceWorker () {
  if (!import.meta.env.PROD || isNativeApp || inDiscord || onCrazyGames || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* installing is optional: the site works without it */ })
  })
}
