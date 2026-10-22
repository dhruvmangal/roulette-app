import { getPreferences } from './preferences'

let context: AudioContext | null = null

function audio () {
  if (typeof window === 'undefined' || !window.AudioContext) return null
  context ??= new window.AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

/** Chip clicks and result jingles follow the player's sound settings. */
const soundsOn = () => { const { effects, volume } = getPreferences(); return effects && volume > 0 }

function tone (ctx: AudioContext, frequency: number, start: number, length: number, volume: number, type: OscillatorType = 'sine') {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * getPreferences().volume), start + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + length + 0.02)
}

export function playResult (won: boolean, big: boolean) {
  if (!soundsOn()) return
  const ctx = audio()
  if (!ctx) return
  const now = ctx.currentTime
  if (!won) {
    ;[293.66, 246.94, 196].forEach((f, i) => tone(ctx, f, now + i * 0.2, 0.5, 0.06, 'triangle'))
    return
  }
  const notes = big ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568] : [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((f, i) => tone(ctx, f, now + i * 0.11, 0.45, 0.09))
  tone(ctx, notes[notes.length - 1], now + notes.length * 0.11, 1.4, 0.07)
}

export function playChip () {
  if (!soundsOn()) return
  const ctx = audio()
  if (ctx) tone(ctx, 1900, ctx.currentTime, 0.06, 0.05, 'triangle')
}

/** A soft tick: a plinko peg, a wheel slice passing the pointer, a hoofbeat. */
export function playTick (pitch = 1) {
  if (!soundsOn()) return
  const ctx = audio()
  if (ctx) tone(ctx, 1200 * pitch, ctx.currentTime, 0.03, 0.03, 'triangle')
}

/** Cashing out of a flight, or a ball landing in a paying slot. */
export function playCashOut () {
  if (!soundsOn()) return
  const ctx = audio()
  if (!ctx) return
  const now = ctx.currentTime
  ;[880, 1174.66, 1567.98].forEach((f, i) => tone(ctx, f, now + i * 0.07, 0.25, 0.07))
}

/** The rocket or plane lost: a falling sweep. */
export function playCrash () {
  if (!soundsOn()) return
  const ctx = audio()
  if (!ctx) return
  const now = ctx.currentTime
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'sawtooth'
  oscillator.frequency.setValueAtTime(420, now)
  oscillator.frequency.exponentialRampToValueAtTime(55, now + 0.5)
  gain.gain.setValueAtTime(Math.max(0.0001, 0.07 * getPreferences().volume), now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.6)
}
