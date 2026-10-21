import { getPreferences, subscribePreferences } from './preferences'
/**
 * Physically driven roulette audio. The 3D wheel calls `update` every frame with what the ball
 * is doing (speed, contact, position relative to the listener) and `impact` on collisions, so the
 * sound follows the simulation exactly: rolling rumble on the track, diamond clacks, fret clatter.
 */

export type ImpactKind = 'track' | 'diamond' | 'fret' | 'pocket'

export interface RollState {
  /** Ball angular speed around the wheel, rad/s, relative to the surface it is touching. */
  speed: number
  /** Whether the ball is touching a surface (false while it is in the air between bounces). */
  contact: boolean
  /** 'track' while on the wooden ball track/apron, 'rotor' once on the spinning numbers/pockets. */
  surface: 'track' | 'rotor'
  /** Stereo position from the listener's point of view, -1 (left) to 1 (right). */
  pan: number
  /** Loudness factor from distance to the listener: about 1 at the wheel's centre distance. */
  proximity: number
  /** Rotor angular speed, rad/s. */
  rotorSpeed: number
}

// Resonant modes (Hz) and decay (s) of each surface the ball hits: hard resin ball on brass,
// chrome and lacquered wood. Slightly inharmonic partials are what make hits sound "real".
const MODES: Record<ImpactKind, { partials: number[], decay: number, noiseHz: number, noiseQ: number, level: number }> = {
  track: { partials: [430, 1010, 1730], decay: 0.035, noiseHz: 1400, noiseQ: 0.9, level: 0.5 },
  diamond: { partials: [1680, 2990, 4420, 6150], decay: 0.11, noiseHz: 3800, noiseQ: 1.2, level: 0.9 },
  fret: { partials: [2350, 3830, 5260, 7310], decay: 0.06, noiseHz: 5200, noiseQ: 1.5, level: 0.55 },
  pocket: { partials: [610, 1390, 2480], decay: 0.05, noiseHz: 2200, noiseQ: 1, level: 0.6 }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

let shared: RouletteSound | null = null

export class RouletteSound {
  private readonly ctx: AudioContext
  private readonly bus: GainNode
  private readonly master: GainNode
  private readonly noise: AudioBuffer
  private loops: { stop: () => void, set: (state: RollState) => void } | null = null
  private stopTimer = 0

  /** One engine per page; returns null where Web Audio is unavailable. */
  static get (): RouletteSound | null {
    if (shared) return shared
    const Context = typeof window !== 'undefined' ? window.AudioContext : undefined
    if (!Context) return null
    shared = new RouletteSound(new Context())
    // Dev only: lets the engine be inspected from the console.
    if (import.meta.env.DEV) (window as unknown as { __rouletteSound?: RouletteSound }).__rouletteSound = shared
    return shared
  }

  private constructor (ctx: AudioContext) {
    this.ctx = ctx
    this.noise = this.pinkNoise(3)

    // Dry signal plus a short casino-room reverb.
    const master = ctx.createGain()
    this.master = master
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -14
    compressor.ratio.value = 3
    master.connect(compressor).connect(ctx.destination)
    this.bus = ctx.createGain()
    const reverb = ctx.createConvolver()
    reverb.buffer = this.roomImpulse(1.1)
    const wet = ctx.createGain()
    wet.gain.value = 0.22
    this.bus.connect(master)
    this.bus.connect(reverb).connect(wet).connect(master)

    // The player's volume, and whether the wheel makes sound at all, can change at any time.
    this.applyPreferences()
    subscribePreferences(() => this.applyPreferences())

    // Silence in background tabs: the wheel's animation pauses there, so a held rumble would sound stuck.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void ctx.suspend()
      else if (this.loops) void ctx.resume()
    })
  }

  private applyPreferences () {
    const { volume, wheel } = getPreferences()
    this.master.gain.setTargetAtTime(0.9 * volume, this.ctx.currentTime, 0.05)
    this.bus.gain.setTargetAtTime(wheel ? 1 : 0, this.ctx.currentTime, 0.05)
  }

  private pinkNoise (seconds: number) {
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * seconds), this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let b0 = 0; let b1 = 0; let b2 = 0
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + white * 0.099046
      b1 = 0.963 * b1 + white * 0.2965164
      b2 = 0.57 * b2 + white * 1.0526913
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2
    }
    return buffer
  }

  private roomImpulse (seconds: number) {
    const rate = this.ctx.sampleRate
    const buffer = this.ctx.createBuffer(2, Math.ceil(rate * seconds), rate)
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel)
      for (let i = 0; i < data.length; i++) {
        const t = i / rate
        data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 5.5) * (t < 0.012 ? t / 0.012 : 1)
      }
    }
    return buffer
  }

  private loopNoise () {
    const source = this.ctx.createBufferSource()
    source.buffer = this.noise
    source.loop = true
    source.start(this.ctx.currentTime, Math.random() * this.noise.duration)
    return source
  }

  /** Starts the continuous layers (ball roll, rotor hum). Call from a user gesture. */
  start () {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    window.clearTimeout(this.stopTimer)
    if (this.loops) return
    const ctx = this.ctx
    const now = ctx.currentTime

    // Ball roll: a body (wood rumble) and a whirr (the ball's own ring), amplitude-modulated
    // at the rolling rate so it has the grainy "rrrr" texture of a ball on lacquered wood.
    const rollOut = ctx.createGain()
    rollOut.gain.value = 0
    const rollPan = ctx.createStereoPanner()
    rollOut.connect(rollPan).connect(this.bus)

    const rollSource = this.loopNoise()
    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 120
    const body = ctx.createBiquadFilter()
    body.type = 'bandpass'
    body.Q.value = 0.8
    const whirr = ctx.createBiquadFilter()
    whirr.type = 'bandpass'
    whirr.Q.value = 7
    const whirrGain = ctx.createGain()
    whirrGain.gain.value = 0.55
    const texture = ctx.createGain()
    texture.gain.value = 0.75
    const texLfo = ctx.createOscillator()
    texLfo.type = 'triangle'
    const texDepth = ctx.createGain()
    texDepth.gain.value = 0.25
    texLfo.connect(texDepth).connect(texture.gain)
    texLfo.start(now)

    rollSource.connect(highpass)
    highpass.connect(body).connect(texture)
    highpass.connect(whirr).connect(whirrGain).connect(texture)
    texture.connect(rollOut)

    // Rotor: low bearing rumble and air movement, follows the rotor's speed.
    const rotorSource = this.loopNoise()
    const rotorFilter = ctx.createBiquadFilter()
    rotorFilter.type = 'lowpass'
    rotorFilter.frequency.value = 160
    const rotorOut = ctx.createGain()
    rotorOut.gain.value = 0
    rotorSource.connect(rotorFilter).connect(rotorOut).connect(this.bus)

    const smooth = 0.04
    this.loops = {
      set: state => {
        const t = ctx.currentTime
        const speed = Math.max(0, state.speed)
        const onTrack = state.surface === 'track'
        // Faster ball: louder, brighter, faster grain. On the rotor it rolls with the pockets, so quieter.
        const level = state.contact ? clamp(speed / 10, 0, 1) ** 0.8 * (onTrack ? 0.42 : 0.2) * state.proximity : 0
        rollOut.gain.setTargetAtTime(level, t, smooth)
        rollPan.pan.setTargetAtTime(clamp(state.pan, -1, 1), t, smooth)
        body.frequency.setTargetAtTime((onTrack ? 380 : 300) + speed * 55, t, smooth)
        whirr.frequency.setTargetAtTime((onTrack ? 1500 : 1100) + speed * 170, t, smooth)
        texLfo.frequency.setTargetAtTime(Math.max(0.5, speed * 2.6), t, smooth)
        rotorOut.gain.setTargetAtTime(clamp(state.rotorSpeed / 4, 0, 1) * 0.16, t, 0.15)
        rotorFilter.frequency.setTargetAtTime(90 + state.rotorSpeed * 30, t, 0.15)
      },
      stop: () => {
        const t = ctx.currentTime
        rollOut.gain.setTargetAtTime(0, t, 0.08)
        rotorOut.gain.setTargetAtTime(0, t, 0.4)
        window.setTimeout(() => { rollSource.stop(); rotorSource.stop(); texLfo.stop() }, 2500)
      }
    }
  }

  update (state: RollState) {
    this.loops?.set(state)
  }

  /** A single collision: a short noise transient plus decaying resonant modes. */
  impact (kind: ImpactKind, strength: number, pan = 0, proximity = 1) {
    const ctx = this.ctx
    const mode = MODES[kind]
    const level = clamp(strength, 0, 1.2) * mode.level * proximity
    if (level < 0.01) return
    const t = ctx.currentTime + 0.002
    const out = ctx.createGain()
    out.gain.value = level
    const panner = ctx.createStereoPanner()
    panner.pan.value = clamp(pan, -1, 1)
    out.connect(panner).connect(this.bus)
    const detune = 1 + (Math.random() - 0.5) * 0.08

    const burst = ctx.createBufferSource()
    burst.buffer = this.noise
    const burstFilter = ctx.createBiquadFilter()
    burstFilter.type = 'bandpass'
    burstFilter.frequency.value = mode.noiseHz * detune
    burstFilter.Q.value = mode.noiseQ
    const burstGain = ctx.createGain()
    burstGain.gain.setValueAtTime(0.0001, t)
    burstGain.gain.exponentialRampToValueAtTime(0.9, t + 0.0015)
    burstGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.018 + mode.decay * 0.2)
    burst.connect(burstFilter).connect(burstGain).connect(out)
    burst.start(t, Math.random() * (this.noise.duration - 0.2), 0.12)

    mode.partials.forEach((frequency, i) => {
      const oscillator = ctx.createOscillator()
      oscillator.frequency.value = frequency * detune * (1 + (Math.random() - 0.5) * 0.02)
      const gain = ctx.createGain()
      const decay = mode.decay / (1 + i * 0.45)
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.35 / (i + 1), t + 0.001)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay)
      oscillator.connect(gain).connect(out)
      oscillator.start(t)
      oscillator.stop(t + decay + 0.02)
    })
    window.setTimeout(() => panner.disconnect(), (mode.decay + 0.3) * 1000)
  }

  /** Fades the continuous layers out after the ball has come to rest. */
  finish (afterSeconds = 1.2) {
    window.clearTimeout(this.stopTimer)
    this.stopTimer = window.setTimeout(() => {
      this.loops?.stop()
      this.loops = null
    }, afterSeconds * 1000)
  }
}
