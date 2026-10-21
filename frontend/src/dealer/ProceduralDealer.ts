import * as THREE from 'three'
import { speak, visemeTrack, type SpeakHandle, type Viseme, type VisemeKey } from './speech'
import { GesturePlayer } from './gestures'
import type { Dealer, Gesture, SayOptions } from './types'

/** Table units are 25 cm. Hips stand at about 96 cm, so the table top (90 cm) meets her just below the waist. */
const HIP_HEIGHT = 3.85
/** [mouth opening, mouth width] for each of our spelling-based visemes. */
const MOUTH: Record<Viseme, [number, number]> = {
  AA_VI_00_Sil: [0, 1], AA_VI_01_PP: [0, 0.9], AA_VI_02_FF: [0.12, 1], AA_VI_03_TH: [0.25, 1], AA_VI_04_DD: [0.3, 1],
  AA_VI_05_KK: [0.4, 1], AA_VI_06_CH: [0.3, 0.7], AA_VI_07_SS: [0.15, 1.2], AA_VI_08_nn: [0.2, 1], AA_VI_09_RR: [0.3, 0.8],
  AA_VI_10_aa: [0.9, 1.05], AA_VI_11_E: [0.55, 1.25], AA_VI_12_I: [0.35, 1.3], AA_VI_13_O: [0.7, 0.65], AA_VI_14_U: [0.45, 0.55]
}

const SKIN = '#d9a384'
interface Arm { shoulder: THREE.Group, elbow: THREE.Group }

/**
 * A croupier built entirely from three.js primitives: black hair, a fitted black cocktail dress
 * with gold details. Whole-body procedural animation covers breathing, blinking, lip-sync, calling
 * numbers and reactions to a win or a loss. Index 0 of the arms is her right (the gesturing hand).
 */
export class ProceduralDealer implements Dealer {
  readonly root = new THREE.Group()
  private readonly hips = new THREE.Group()
  private readonly upper = new THREE.Group()
  private readonly chest = new THREE.Group()
  private readonly head = new THREE.Group()
  private readonly arms: Arm[] = []
  private readonly lids: THREE.Group[] = []
  private readonly brows: THREE.Group[] = []
  private readonly mouth = new THREE.Group()
  private readonly lipCurve: THREE.Mesh
  private readonly mouthInside: THREE.Mesh
  private readonly hairBack = new THREE.Group()
  private readonly gestures = new GesturePlayer()
  private mouthOpen = 0
  private mouthWidth = 1
  private clock = 0
  private blinkIn = 2
  private blink = 0
  private speech: { keys: VisemeKey[], startedAt: number, seconds: number } | null = null
  private speakHandle: SpeakHandle | null = null

  private readonly skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.62 })
  private readonly dress = new THREE.MeshStandardMaterial({ color: '#0b0b10', roughness: 0.34, metalness: 0.18, side: THREE.DoubleSide })
  private readonly hair = new THREE.MeshStandardMaterial({ color: '#0a0a0e', roughness: 0.32, metalness: 0.12 })
  private readonly gold = new THREE.MeshStandardMaterial({ color: '#d4af37', roughness: 0.25, metalness: 0.9 })
  private readonly lips = new THREE.MeshStandardMaterial({ color: '#8e1f2f', roughness: 0.35 })
  private readonly dark = new THREE.MeshStandardMaterial({ color: '#07070a', roughness: 0.5 })

  constructor () {
    this.lipCurve = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.026, 8, 28, Math.PI), this.lips)
    this.mouthInside = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ color: '#3a0d12', roughness: 0.8 }))
    this.build()
    this.root.traverse(object => { (object as THREE.Mesh).castShadow = true })
    this.apply()
  }

  static async load (): Promise<ProceduralDealer> {
    return new ProceduralDealer()
  }

  private mesh (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position)
    mesh.scale.set(...scale)
    return mesh
  }

  private ball (radius: number, material: THREE.Material, position: [number, number, number], scale: [number, number, number] = [1, 1, 1]) {
    return this.mesh(new THREE.SphereGeometry(radius, 24, 16), material, position, scale)
  }

  /** A horizontal ring flattened to the body's elliptical cross-section. */
  private ring (radius: number, tube: number, y: number, material: THREE.Material, depth = 0.74) {
    const group = new THREE.Group()
    const torus = this.mesh(new THREE.TorusGeometry(radius, tube, 10, 48), material)
    torus.rotation.x = Math.PI / 2
    group.add(torus)
    group.position.y = y
    group.scale.z = depth
    return group
  }

  /** A limb hanging from its own origin, so rotating the group swings it from the joint. */
  private limb (radius: number, length: number, material: THREE.Material) {
    const geometry = new THREE.CapsuleGeometry(radius, length, 6, 16)
    geometry.translate(0, -(length + 2 * radius) / 2, 0)
    return this.mesh(geometry, material)
  }

  private build () {
    const { hips, upper, chest, head } = this
    hips.position.y = HIP_HEIGHT
    this.root.add(hips)
    hips.add(upper)

    // Legs in sheer black, with black heels.
    for (const side of [-1, 1]) {
      const leg = this.mesh(new THREE.CylinderGeometry(0.17, 0.11, 3.1, 20), this.dark, [side * 0.22, -0.7 - 1.55, 0])
      const shoe = this.mesh(new THREE.BoxGeometry(0.2, 0.12, 0.46), this.dark, [side * 0.22, -HIP_HEIGHT + 0.06, 0.1])
      hips.add(leg, shoe)
    }

    // The dress: a fitted shape with a flared mid-thigh hem.
    const profile = new THREE.SplineCurve([
      [0.76, -0.7], [0.7, -0.35], [0.65, -0.05], [0.55, 0.35], [0.46, 0.7], [0.52, 0.95], [0.58, 1.15], [0.58, 1.3], [0.54, 1.4]
    ].map(([x, y]) => new THREE.Vector2(x, y))).getPoints(48)
    const dress = this.mesh(new THREE.LatheGeometry(profile, 56), this.dress)
    dress.scale.z = 0.74
    upper.add(dress, this.ring(0.5, 0.035, 0.72, this.gold))

    // Skin: chest, neck and shoulders above the neckline.
    chest.position.y = 0
    chest.add(this.ball(1, this.skin, [0, 1.46, 0], [0.62, 0.4, 0.4]))
    chest.add(this.mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.75, 20), this.skin, [0, 1.85, 0]))
    chest.add(this.ring(0.16, 0.017, 1.98, this.gold, 1))
    // A small gold roulette-wheel pin on the bodice.
    const pin = this.mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 24), this.gold, [-0.28, 1.04, 0.36])
    pin.rotation.x = Math.PI / 2
    chest.add(pin)
    upper.add(chest)

    // Arms: black cap sleeves, skin below.
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group()
      shoulder.position.set(side * 0.72, 1.5, 0)
      shoulder.add(this.ball(0.17, this.skin, [0, 0, 0]))
      shoulder.add(this.ball(0.19, this.dress, [0, -0.04, 0], [1, 0.8, 1]))
      shoulder.add(this.limb(0.12, 0.8, this.skin))
      const elbow = new THREE.Group()
      elbow.position.y = -1.04
      elbow.add(this.ball(0.12, this.skin, [0, 0, 0]))
      elbow.add(this.limb(0.09, 0.65, this.skin))
      const hand = this.ball(0.12, this.skin, [0, -0.9, 0.01], [0.9, 1.35, 0.55])
      elbow.add(hand)
      shoulder.add(elbow)
      upper.add(shoulder)
      this.arms.push({ shoulder, elbow })
    }

    this.buildHead()
    head.position.y = 2.55
    head.scale.setScalar(1.15)
    upper.add(head)
  }

  private buildHead () {
    const { head, skin, hair } = this
    head.add(this.ball(1, skin, [0, 0, 0], [0.34, 0.46, 0.4]))
    head.add(this.ball(0.05, skin, [0, -0.07, 0.395], [1, 1.1, 1])) // nose
    for (const side of [-1, 1]) {
      head.add(this.ball(0.05, skin, [side * 0.335, -0.02, 0], [0.7, 1.7, 0.9])) // ear
      head.add(this.ball(0.035, this.gold, [side * 0.34, -0.27, 0.02])) // earring
      const blush = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff7a8a', transparent: true, opacity: 0.2, depthWrite: false }))
      blush.position.set(side * 0.2, -0.12, 0.345)
      blush.scale.set(1, 0.7, 0.3)
      head.add(blush)

      // Eye: white, iris, pupil, glint, and a skin-coloured lid that swings down over it.
      const eye = new THREE.Group()
      eye.position.set(side * 0.14, 0.04, 0.335)
      eye.add(this.ball(0.075, new THREE.MeshStandardMaterial({ color: '#f4f1ee', roughness: 0.3 }), [0, 0, 0], [1, 1.05, 0.8]))
      eye.add(this.ball(0.05, new THREE.MeshStandardMaterial({ color: '#2a1810', roughness: 0.25 }), [0, 0, 0.05], [1, 1, 0.4]))
      eye.add(this.ball(0.027, this.dark, [0, 0, 0.065], [1, 1, 0.4]))
      eye.add(this.ball(0.012, new THREE.MeshBasicMaterial({ color: '#ffffff' }), [0.018, 0.02, 0.075], [1, 1, 0.5]))
      const lid = new THREE.Group()
      lid.add(new THREE.Mesh(new THREE.SphereGeometry(0.088, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), skin))
      eye.add(lid)
      head.add(eye)
      this.lids.push(lid)

      // Winged liner and eyebrow.
      const liner = this.mesh(new THREE.CapsuleGeometry(0.008, 0.11, 4, 8), this.dark, [side * 0.145, 0.118, 0.355])
      liner.rotation.z = Math.PI / 2 - side * 0.12
      liner.rotation.x = -0.25
      head.add(liner)
      const brow = new THREE.Group()
      brow.position.set(side * 0.15, 0.2, 0.345)
      brow.add(this.mesh(new THREE.CapsuleGeometry(0.014, 0.12, 4, 8), hair))
      brow.children[0].rotation.z = Math.PI / 2
      head.add(brow)
      this.brows.push(brow)
    }

    // Mouth: a lip curve that flips between smile and frown, with an opening for speech.
    this.lipCurve.rotation.z = Math.PI
    this.mouth.position.set(0, -0.24, 0.345)
    this.mouth.add(this.mouthInside, this.lipCurve)
    head.add(this.mouth)

    // Hair: crown, back and sides, a swept fringe and long hair behind the shoulders.
    const hairRadii: [number, number, number] = [0.365, 0.495, 0.43]
    const sphere = (phiStart: number, phiLength: number, thetaLength: number, k = 1) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24, phiStart, phiLength, 0, thetaLength), hair)
      mesh.scale.set(hairRadii[0] * k, hairRadii[1] * k, hairRadii[2] * k)
      mesh.material = hair
      ;(mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
      return mesh
    }
    head.add(sphere(Math.PI * 0.93, Math.PI * 1.14, 2.0))
    head.add(sphere(0, Math.PI * 2, 0.85, 1.015))
    const fringe = sphere(Math.PI * 0.2, Math.PI * 0.8, 1.13, 1.08)
    fringe.rotation.y = -0.45
    head.add(fringe)

    const long = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.1, 8, 24), hair)
    long.scale.set(1.12, 1, 0.55)
    long.position.set(0, -0.55, -0.3)
    this.hairBack.add(long)
    head.add(this.hairBack)
    for (const side of [-1, 1]) {
      const lock = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.6, 6, 16), hair)
      lock.position.set(side * 0.3, -0.62, 0.2)
      lock.rotation.z = side * 0.08
      head.add(lock)
    }
  }

  play (gesture: Gesture) {
    this.gestures.play(gesture)
  }

  say (text: string, { gesture, muted, onCaption }: SayOptions) {
    this.speakHandle?.cancel()
    if (gesture) this.play(gesture)
    onCaption?.(text)
    this.speakHandle = speak(text, muted, seconds => {
      this.speech = { keys: visemeTrack(text, seconds), startedAt: this.clock, seconds }
      if (!gesture) this.play('talk')
    }, () => {
      this.speech = null
      onCaption?.(null)
    })
  }

  update (dt: number) {
    this.clock += dt
    const t = this.clock
    this.gestures.update(dt, !!this.speech)
    const p = this.gestures.pose

    // Visemes: the mouth follows the key active at this moment of the line.
    let open = 0
    let width = 1
    if (this.speech) {
      const elapsed = t - this.speech.startedAt
      const keys = this.speech.keys
      let i = keys.length - 1
      while (i > 0 && keys[i].at > elapsed) i--
      if (elapsed < this.speech.seconds && keys[i]) [open, width] = MOUTH[keys[i].viseme]
    }
    const mouthK = Math.min(1, dt * 20)
    this.mouthOpen += (open - this.mouthOpen) * mouthK
    this.mouthWidth += (width - this.mouthWidth) * mouthK

    this.blinkIn -= dt
    if (this.blinkIn <= 0) { this.blink = 1; this.blinkIn = 2.5 + Math.random() * 3.5 }
    this.blinkAmount = this.blink > 0 ? Math.sin(Math.PI * (1 - this.blink)) : 0
    this.blink = Math.max(0, this.blink - dt * 7)

    this.hairBack.rotation.x = Math.sin(t * 1.1) * 0.015 + p.headX * -0.3
    this.apply()
  }

  private blinkAmount = 0

  private apply () {
    const p = this.gestures.pose
    this.hips.position.y = HIP_HEIGHT + p.lift
    this.hips.rotation.z = p.spineZ * 0.6
    this.upper.rotation.set(p.spineX, 0, p.spineZ * 0.4)
    this.chest.scale.set(1, 1 + Math.sin(this.clock * 1.6) * 0.006, 1 + Math.sin(this.clock * 1.6) * 0.012)
    this.head.rotation.set(p.headX, p.headY, p.headZ)

    this.arms.forEach(({ shoulder, elbow }, i) => {
      const side = i === 0 ? -1 : 1
      const arm = p.arms[i]
      shoulder.rotation.set(arm.sx, 0, side * arm.sz)
      elbow.rotation.set(arm.ex, 0, side * arm.ez)
    })

    const closed = Math.max(this.blinkAmount, p.lid)
    for (const lid of this.lids) lid.rotation.x = -1.4 + closed * 2.75
    this.brows.forEach((brow, i) => {
      const side = i === 0 ? -1 : 1
      brow.position.y = 0.2 + p.browLift * 0.05
      brow.rotation.z = side * (-0.08 + p.browTilt)
    })

    // Smile is positive, a frown negative; speech opens the mouth under the lip curve.
    const open = this.mouthOpen
    this.lipCurve.scale.set(1, p.smile, 1)
    this.mouth.scale.x = this.mouthWidth * (1 + Math.max(0, p.smile) * 0.12)
    this.mouthInside.scale.set(0.075, Math.max(0.001, open * 0.075), 0.02)
    this.mouthInside.position.y = -p.smile * 0.05 - open * 0.03
    this.lipCurve.position.y = -open * 0.02
  }

  dispose () {
    this.speakHandle?.cancel()
    const seen = new Set<{ dispose: () => void }>()
    this.root.traverse(object => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      seen.add(mesh.geometry)
      ;([] as THREE.Material[]).concat(mesh.material).forEach(material => seen.add(material))
    })
    seen.forEach(item => item.dispose())
  }
}
