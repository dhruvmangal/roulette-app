import { useSyncExternalStore } from 'react'
import { parsePreferences, type Preferences } from './preferencesCore.ts'
import { readSetting, writeSetting } from './settings'

export { DEFAULT_PREFERENCES, parsePreferences, type Preferences } from './preferencesCore.ts'

const KEY = 'roulette.prefs'

let current = parsePreferences(readSetting(KEY, 'null'), readSetting('roulette.voiceMuted', '0') === '1')
const listeners = new Set<() => void>()

export const getPreferences = () => current

export function setPreferences (patch: Partial<Preferences>) {
  current = parsePreferences(JSON.stringify({ ...current, ...patch }))
  writeSetting(KEY, JSON.stringify(current))
  listeners.forEach(listener => listener())
}

export function subscribePreferences (listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export const usePreferences = () => useSyncExternalStore(subscribePreferences, getPreferences)
