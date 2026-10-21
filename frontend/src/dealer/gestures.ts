import type { Gesture } from './types'

export const GESTURE_SECONDS: Record<Gesture, number> = { idle: 0, talk: 2.4, present: 2.4, wave: 2.8, cheer: 3.4, sympathy: 3.0 }

/** Joint angles in radians. Arm index 0 is her right (the gesturing hand); sz is the outward spread. */
export interface ArmPose { sx: number, sz: number, ex: number, ez: number }
export interface Pose {
  spineX: number, spineZ: number, headX: number, headY: number, headZ: number, lift: number
  smile: number, lid: number, browLift: number, browTilt: number
  arms: [ArmPose, ArmPose]
}

export const REST_ARM: Readonly<ArmPose> = { sx: -0.2, sz: 0.07, ex: -0.9, ez: 0 }
const restArm = (): ArmPose => ({ ...REST_ARM })
export const restPose = (): Pose => ({
  spineX: 0, spineZ: 0, headX: 0, headY: 0, headZ: 0, lift: 0, smile: 0.45, lid: 0, browLift: 0, browTilt: 0,
  arms: [restArm(), restArm()]
})

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (t: number) => t * t * (3 - 2 * t)

/**
 * Turns the current gesture into a smoothed pose each frame: idle breathing and looking around,
 * calling numbers, waving, presenting the wheel and reacting to a win or a loss. Shared by every
 * dealer that has joints to move.
 */
export class GesturePlayer {
  readonly pose = restPose()
  private gesture: Gesture = 'idle'
  private gestureAt = 0
  private clock = 0

  play (gesture: Gesture) {
    this.gesture = gesture
    this.gestureAt = this.clock
  }

  update (dt: number, speaking: boolean) {
    this.clock += dt
    const goal = this.target(this.clock, speaking)
    const k = Math.min(1, dt * 9)
    const p = this.pose
    const approach = (current: number, target: number) => current + (target - current) * k
    for (const key of ['spineX', 'spineZ', 'headX', 'headY', 'headZ', 'lift', 'smile', 'lid', 'browLift', 'browTilt'] as const) p[key] = approach(p[key], goal[key])
    for (let i = 0; i < 2; i++) for (const key of ['sx', 'sz', 'ex', 'ez'] as const) p.arms[i][key] = approach(p.arms[i][key], goal.arms[i][key])
  }

  /** The pose this gesture asks for right now, before smoothing. */
  private target (t: number, speaking: boolean): Pose {
    const p = restPose()
    const length = GESTURE_SECONDS[this.gesture]
    const local = t - this.gestureAt
    const e = length
      ? smooth(clamp01(local / 0.35)) * (1 - smooth(clamp01((local - (length - 0.6)) / 0.6)))
      : 0
    if (length && local >= length) this.gesture = 'idle'

    // Idle: breathing, a weight shift, and a slow look around.
    p.lift = Math.sin(t * 1.6) * 0.012
    p.spineZ = Math.sin(t * 0.6) * 0.015
    p.headY = Math.sin(t * 0.37) * 0.12 + Math.sin(t * 0.9) * 0.03
    p.headX = 0.03 + Math.sin(t * 0.5) * 0.02
    p.arms[1].sz += Math.sin(t * 1.6) * 0.01

    const [lead, other] = p.arms
    switch (this.gesture) {
      case 'talk':
        p.headX += 0.05 * e * Math.sin(local * 6)
        p.headY += 0.06 * e * Math.sin(local * 2.3)
        lead.sx = -0.2 - 0.35 * e
        lead.ex = -0.9 - 0.6 * e + 0.12 * e * Math.sin(local * 5)
        lead.ez = 0.25 * e * Math.sin(local * 4)
        break
      case 'present': // sweep the hand over the wheel and look at it
        lead.sx = -0.2 - 1.05 * e
        lead.sz = 0.07 + 0.25 * e
        lead.ex = -0.9 + 0.55 * e
        p.headX += 0.2 * e
        p.spineX += 0.1 * e
        p.headY -= 0.12 * e
        break
      case 'wave':
        lead.sx = -0.2 + 0.1 * e
        lead.sz = 0.07 + 2.5 * e
        lead.ex = -0.9 + 0.55 * e
        lead.ez = e * (0.5 * Math.sin(local * 9))
        p.headZ = -0.08 * e
        p.smile = 0.45 + 0.4 * e
        break
      case 'cheer': // both arms up, bouncing, laughing
        for (const arm of p.arms) { arm.sx = -0.2 + 0.2 * e + 0.12 * e * Math.sin(local * 11); arm.sz = 0.07 + 2.2 * e; arm.ex = -0.9 + 0.5 * e }
        lead.ez = 0.3 * e * Math.sin(local * 13)
        other.ez = -0.3 * e * Math.sin(local * 13)
        p.lift += Math.abs(Math.sin(local * 8)) * 0.08 * e
        p.headX -= 0.1 * e
        p.headZ = 0.06 * e * Math.sin(local * 4)
        p.smile = 0.45 + 0.55 * e
        p.lid = 0.5 * e
        p.browLift = 0.6 * e
        break
      case 'sympathy': // a sympathetic head tilt, one palm up, the other hand at the chest
        p.headZ = 0.14 * e
        p.headX += 0.08 * e
        p.headY += 0.1 * e * Math.sin(local * 3)
        p.lift -= 0.04 * e
        lead.sx = -0.2 - 0.5 * e
        lead.sz = 0.07 + 0.3 * e
        lead.ex = -0.9 - 0.7 * e
        other.sx = -0.2 - 0.2 * e
        other.ex = -0.9 - 1.1 * e
        other.ez = -0.45 * e
        p.smile = 0.45 - 0.85 * e
        p.browTilt = -0.28 * e
        p.browLift = 0.35 * e
        break
    }
    if (speaking) p.smile = Math.max(p.smile, 0.25)
    return p
  }
}
