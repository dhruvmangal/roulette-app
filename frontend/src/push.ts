import { PushNotifications } from '@capacitor/push-notifications'
import type { ApiClient } from '@roulette/api-client'
import { APP_VERSION, deviceId } from './deviceReport'
import { currentLocale } from './i18n'
import { isNativeApp, platform } from './platform'
import { readSetting, writeSetting } from './settings'

/** The phone's push token, kept to take it off the account when the player signs out. */
const TOKEN_KEY = 'roulette.pushToken'
const REGISTER_TIMEOUT_MS = 15000

export type PushPermission = 'unsupported' | 'prompt' | 'granted' | 'denied'

/** Push notifications exist in the apps; a browser tab can't be woken when it isn't open. */
export const pushSupported = isNativeApp

export async function pushPermission (): Promise<PushPermission> {
  if (!pushSupported) return 'unsupported'
  try {
    const { receive } = await PushNotifications.checkPermissions()
    return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt'
  } catch { return 'denied' }
}

/** Asks the system for this phone's token, once. Rejects if the system, Firebase or Apple refuses. */
function obtainToken (): Promise<string> {
  return new Promise((resolve, reject) => {
    const handles: Array<Promise<{ remove: () => Promise<void> }>> = []
    const done = (finish: () => void) => { clearTimeout(timer); handles.forEach(handle => { void handle.then(registered => registered.remove()) }); finish() }
    const timer = window.setTimeout(() => done(() => reject(new Error('Registering for notifications timed out'))), REGISTER_TIMEOUT_MS)
    handles.push(PushNotifications.addListener('registration', ({ value }) => done(() => resolve(value))))
    handles.push(PushNotifications.addListener('registrationError', ({ error }) => done(() => reject(new Error(error)))))
    PushNotifications.register().catch(failure => done(() => reject(failure as Error)))
  })
}

/** Tells the server about this phone so it can be notified for the signed-in player. */
async function registerWithServer (api: ApiClient, token: string) {
  await api.registerPushToken({ token, platform: platform === 'ios' ? 'ios' : 'android', deviceId: deviceId(), appVersion: APP_VERSION, language: currentLocale() })
  writeSetting(TOKEN_KEY, token)
}

/**
 * Turns notifications on: asks permission if it hasn't been asked, then registers the phone.
 * 'denied' means the player said no (or can't, from here: it's a system setting now);
 * 'error' means the phone couldn't register (push isn't set up for this build).
 */
export async function enablePush (api: ApiClient): Promise<'enabled' | 'denied' | 'error' | 'unsupported'> {
  if (!pushSupported) return 'unsupported'
  try {
    let permission = await pushPermission()
    if (permission === 'prompt') {
      const asked = await PushNotifications.requestPermissions()
      permission = asked.receive === 'granted' ? 'granted' : 'denied'
    }
    if (permission !== 'granted') return 'denied'
    // Android 8+ needs the channel the server names in its messages.
    if (platform === 'android') await PushNotifications.createChannel({ id: 'default', name: 'Roulette', description: 'Daily chips, friends and achievements', importance: 4 }).catch(() => {})
    await registerWithServer(api, await obtainToken())
    return 'enabled'
  } catch {
    return 'error'
  }
}

/** On sign-in: if notifications were allowed before, hand the server this phone's current token. */
export async function syncPush (api: ApiClient) {
  if (!pushSupported || await pushPermission() !== 'granted') return
  try { await registerWithServer(api, await obtainToken()) } catch { /* not set up for this build: nothing to do */ }
}

/** Stops this phone's notifications for the signed-in player (on sign-out, or when they switch it off). */
export async function disablePush (api: ApiClient) {
  const token = readSetting(TOKEN_KEY, '')
  if (!token) return
  await api.unregisterPushToken(token).catch(() => {})
  writeSetting(TOKEN_KEY, '')
}

/** Calls `handle` with the data a notification carried when the player taps it (e.g. { screen: 'friends' }). */
export function onPushOpened (handle: (data: Record<string, string>) => void): () => void {
  if (!pushSupported) return () => {}
  const listener = PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => handle(notification.data ?? {}))
  return () => { void listener.then(registered => registered.remove()) }
}
