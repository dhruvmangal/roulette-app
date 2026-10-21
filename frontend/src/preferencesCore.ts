import { isLocale, type LanguageChoice } from './i18n/core.ts'

/** Per-device choices: how the game sounds and which language it speaks. */
export interface Preferences {
  language: LanguageChoice
  /** Everything's loudness, 0 to 1. */
  volume: number
  /** Chip clicks and the win and loss sounds. */
  effects: boolean
  /** The ball and wheel on the table. */
  wheel: boolean
  /** The dealer calls the numbers aloud. */
  voice: boolean
  voiceVolume: number
  /** Phone vibration (the app only). */
  haptics: boolean
  /** Show the table's lines about what players bet and won in the chat. */
  chatBets: boolean
  /** Let the table's chat say what I bet and won. */
  shareBets: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  language: 'auto', volume: 0.8, effects: true, wheel: true, voice: true, voiceVolume: 1, haptics: true, chatBets: true, shareBets: true
}

const clamp = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback
const flag = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback

/** Anything stored that isn't valid is ignored, so a bad value can't break the app. */
export function parsePreferences (stored: string | null, legacyVoiceMuted = false): Preferences {
  let raw: Record<string, unknown> = {}
  try { const parsed = JSON.parse(stored ?? 'null'); if (parsed && typeof parsed === 'object') raw = parsed } catch { /* defaults */ }
  const defaults = DEFAULT_PREFERENCES
  return {
    language: raw.language === 'auto' || isLocale(raw.language) ? raw.language as LanguageChoice : defaults.language,
    volume: clamp(raw.volume, defaults.volume),
    effects: flag(raw.effects, defaults.effects),
    wheel: flag(raw.wheel, defaults.wheel),
    // Before preferences existed, the dealer's voice had its own on/off switch.
    voice: flag(raw.voice, !legacyVoiceMuted),
    voiceVolume: clamp(raw.voiceVolume, defaults.voiceVolume),
    haptics: flag(raw.haptics, defaults.haptics),
    chatBets: flag(raw.chatBets, defaults.chatBets),
    shareBets: flag(raw.shareBets, defaults.shareBets)
  }
}

