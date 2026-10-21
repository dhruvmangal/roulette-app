import type { DeviceReport } from '@roulette/contracts'
import { Device } from '@capacitor/device'
import { Network } from '@capacitor/network'
import { isNativeApp, platform } from './platform'
import { readSetting, writeSetting } from './settings'

const DEVICE_KEY = 'roulette.deviceId'
export const APP_VERSION = '1.0.0'

/** A random id for this install, kept in local storage (app data in the apps). */
export function deviceId (): string {
  const known = readSetting(DEVICE_KEY, '')
  if (/^[A-Za-z0-9-]{16,64}$/.test(known)) return known
  const made = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
  writeSetting(DEVICE_KEY, made)
  return made
}

interface NetworkInformation { type?: string, effectiveType?: string }

/** wifi or cellular from the app; browsers only expose this on Android Chrome. */
async function network (): Promise<Pick<DeviceReport, 'networkType' | 'networkQuality'>> {
  const browser = (navigator as Navigator & { connection?: NetworkInformation }).connection
  const quality = browser?.effectiveType
  if (isNativeApp) {
    const status = await Network.getStatus().catch(() => null)
    return { networkType: status?.connectionType, networkQuality: quality }
  }
  return { networkType: browser?.type, networkQuality: quality }
}

async function nativeDetails (): Promise<DeviceReport['native']> {
  if (!isNativeApp) return undefined
  const info = await Device.getInfo().catch(() => null)
  return info ? { manufacturer: info.manufacturer, model: info.model, osVersion: info.osVersion, isVirtual: info.isVirtual } : undefined
}

/**
 * What this device is and how it is connected, for the server's records:
 * no permission prompts, nothing beyond what any site can see. The server
 * adds the IP address and its approximate place.
 */
export async function collectDeviceReport (): Promise<DeviceReport> {
  const drop = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T
  return drop({
    deviceId: deviceId(),
    platform,
    native: await nativeDetails(),
    appVersion: APP_VERSION,
    screenWidth: Math.round(window.screen.width),
    screenHeight: Math.round(window.screen.height),
    pixelRatio: Math.round(window.devicePixelRatio * 100) / 100,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    orientation: window.screen.orientation?.type ?? (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'),
    ...(await network())
  })
}
