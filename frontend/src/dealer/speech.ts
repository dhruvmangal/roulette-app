import { currentLocale } from '../i18n'
import { getPreferences } from '../preferences'

/** Blendshape names on the dealer's head (Rocketbox visemes). */
export type Viseme =
  | 'AA_VI_00_Sil' | 'AA_VI_01_PP' | 'AA_VI_02_FF' | 'AA_VI_03_TH' | 'AA_VI_04_DD' | 'AA_VI_05_KK'
  | 'AA_VI_06_CH' | 'AA_VI_07_SS' | 'AA_VI_08_nn' | 'AA_VI_09_RR' | 'AA_VI_10_aa' | 'AA_VI_11_E'
  | 'AA_VI_12_I' | 'AA_VI_13_O' | 'AA_VI_14_U'

export interface VisemeKey { at: number, viseme: Viseme }

const DIGRAPHS: [string, Viseme][] = [['th', 'AA_VI_03_TH'], ['ch', 'AA_VI_06_CH'], ['sh', 'AA_VI_06_CH'], ['ee', 'AA_VI_12_I'], ['oo', 'AA_VI_14_U']]
const LETTERS: Record<string, Viseme> = {
  a: 'AA_VI_10_aa', e: 'AA_VI_11_E', i: 'AA_VI_12_I', y: 'AA_VI_12_I', o: 'AA_VI_13_O', u: 'AA_VI_14_U', w: 'AA_VI_14_U',
  p: 'AA_VI_01_PP', b: 'AA_VI_01_PP', m: 'AA_VI_01_PP', f: 'AA_VI_02_FF', v: 'AA_VI_02_FF',
  t: 'AA_VI_04_DD', d: 'AA_VI_04_DD', k: 'AA_VI_05_KK', g: 'AA_VI_05_KK', c: 'AA_VI_05_KK', q: 'AA_VI_05_KK',
  j: 'AA_VI_06_CH', s: 'AA_VI_07_SS', z: 'AA_VI_07_SS', x: 'AA_VI_07_SS', n: 'AA_VI_08_nn', l: 'AA_VI_08_nn', r: 'AA_VI_09_RR', h: 'AA_VI_10_aa'
}

/** Rough spelling-based viseme track: good enough for believable lips without a phoneme engine. */
export function visemeTrack (text: string, seconds: number): VisemeKey[] {
  const lower = text.toLowerCase()
  const keys: { viseme: Viseme, weight: number }[] = []
  for (let i = 0; i < lower.length; i++) {
    const pair = DIGRAPHS.find(([digraph]) => lower.startsWith(digraph, i))
    if (pair) { keys.push({ viseme: pair[1], weight: 1 }); i++; continue }
    const char = lower[i]
    if (LETTERS[char]) keys.push({ viseme: LETTERS[char], weight: 'aeiouy'.includes(char) ? 1.3 : 0.8 })
    else if (/[,.!?]/.test(char)) keys.push({ viseme: 'AA_VI_00_Sil', weight: 3 })
    else if (char === ' ') keys.push({ viseme: 'AA_VI_00_Sil', weight: 0.6 })
  }
  const total = keys.reduce((sum, key) => sum + key.weight, 0) || 1
  let at = 0
  return keys.map(key => {
    const result = { at, viseme: key.viseme }
    at += (key.weight / total) * seconds
    return result
  })
}

/** Rough speaking time for the browser voice at rate 1, used to pace the lips. */
export const estimateSeconds = (text: string) => 0.35 + text.length * 0.068

const FEMALE_HINTS = /female|woman|samantha|victoria|karen|moira|tessa|serena|fiona|susan|zira|aria|jenny|libby|sonia|allison|ava|kate|google uk english female/i

const cachedVoices = new Map<string, SpeechSynthesisVoice | null>()

/** The dealer's browser voice for a language: a woman's voice where the device has one, else any voice for it. */
export function pickVoice (language = 'en'): SpeechSynthesisVoice | null {
  const cached = cachedVoices.get(language)
  if (cached !== undefined) return cached
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const spoken = voices.filter(voice => voice.lang.toLowerCase().split(/[-_]/)[0] === language)
  const english = voices.filter(voice => /^en(-|_|$)/i.test(voice.lang))
  const chosen = spoken.find(voice => FEMALE_HINTS.test(voice.name) && (language !== 'en' || /GB|UK/i.test(voice.lang + voice.name))) ??
    spoken.find(voice => FEMALE_HINTS.test(voice.name)) ??
    spoken[0] ??
    // Nothing for this language on the device: the English voice reads it, rather than silence.
    english.find(voice => FEMALE_HINTS.test(voice.name)) ?? english[0] ?? voices[0] ?? null
  cachedVoices.set(language, chosen)
  return chosen
}

/** Whether this device has a voice that speaks the language. */
export const hasVoiceFor = (language: string) => speechSupported() &&
  window.speechSynthesis.getVoices().some(voice => voice.lang.toLowerCase().split(/[-_]/)[0] === language)

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

/** Call from a click handler so iOS/Safari allow later speech. */
export function unlockSpeech () {
  if (!speechSupported()) return
  window.speechSynthesis.getVoices()
  const utterance = new SpeechSynthesisUtterance('')
  utterance.volume = 0
  window.speechSynthesis.speak(utterance)
}

export interface SpeakHandle { cancel: () => void }

/**
 * Speaks with the browser voice. onStart fires when audio actually begins (or immediately
 * when speech is unavailable or muted), with the duration to pace lip-sync against.
 */
export function speak (text: string, muted: boolean, onStart: (seconds: number) => void, onEnd: () => void): SpeakHandle {
  const fallback = () => {
    const seconds = estimateSeconds(text)
    onStart(seconds)
    const timer = window.setTimeout(onEnd, seconds * 1000)
    return { cancel: () => window.clearTimeout(timer) }
  }
  const { voiceVolume: voiceLevel, volume } = getPreferences()
  const voiceVolume = voiceLevel * volume
  if (muted || voiceVolume <= 0 || !speechSupported()) return fallback()

  const synth = window.speechSynthesis
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = pickVoice(currentLocale())
  if (voice) { utterance.voice = voice; utterance.lang = voice.lang } else utterance.lang = currentLocale()
  utterance.volume = voiceVolume
  utterance.rate = 0.95
  utterance.pitch = 1.08
  let started = false
  let done = false
  const finish = () => { if (!done) { done = true; onEnd() } }
  utterance.onstart = () => { started = true; onStart(estimateSeconds(text) / utterance.rate) }
  utterance.onend = finish
  let errorTimer = 0
  utterance.onerror = event => {
    if (event.error === 'interrupted' || event.error === 'canceled') { finish(); return }
    // Blocked (no user gesture yet) or no voice: keep captions and lips on a timer instead.
    if (!started) { started = true; onStart(estimateSeconds(text)) }
    errorTimer = window.setTimeout(finish, estimateSeconds(text) * 1000)
  }
  synth.speak(utterance)
  // Some browsers never fire onstart (no voices, autoplay policy): animate anyway.
  const guard = window.setTimeout(() => { if (!started) { started = true; onStart(estimateSeconds(text)) } }, 600)
  const hardStop = window.setTimeout(finish, (estimateSeconds(text) + 4) * 1000)
  return {
    cancel: () => {
      window.clearTimeout(guard)
      window.clearTimeout(hardStop)
      window.clearTimeout(errorTimer)
      done = true
      synth.cancel()
    }
  }
}

if (speechSupported()) window.speechSynthesis.addEventListener?.('voiceschanged', () => { cachedVoices.clear() })
