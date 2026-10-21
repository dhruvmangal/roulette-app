import { Capacitor } from '@capacitor/core'
import { inDiscord } from './discord'

/** True inside the iOS or Android app; false in a browser. */
export const isNativeApp = Capacitor.isNativePlatform()
export const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web'

/**
 * Where the API and socket live. The browser uses its own origin (nginx proxies
 * /api and /socket.io). The app's pages load from inside the app, so it needs the
 * server's address: VITE_API_ORIGIN for real builds, or the dev machine, which
 * the iOS simulator reaches as localhost and the Android emulator as 10.0.2.2.
 * Inside a Discord Activity the page may only talk to its own origin: Discord's
 * URL mappings forward /api and /socket.io to the server.
 */
export const apiOrigin: string = inDiscord ? '' : import.meta.env.VITE_API_ORIGIN ??
  (platform === 'android' ? 'http://10.0.2.2' : platform === 'ios' ? 'http://localhost' : '')
