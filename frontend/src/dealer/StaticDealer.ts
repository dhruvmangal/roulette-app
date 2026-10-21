import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { speak, visemeTrack, type SpeakHandle, type VisemeKey } from './speech'
import { baseGesture, type BaseGesture, type Dealer, type Gesture, type SayOptions } from './types'

/**
 * The sculpt is a waist-up bust (~90 cm, i.e. 3.6 table units of 25 cm). Its cut-off waist sits
 * just below the table top (3.6 units above the floor) so the table hides it from the player's side.
 */
const HEIGHT = 3.6
const WAIST_ABOVE_FLOOR = 2.75
const SET_BACK = -0.1
/** A full-body figure stands on the floor at 165 cm and leans from the hips. */
const FIGURE_HEIGHT = 6.6
const HIP_ABOVE_FLOOR = 3.9
const GESTURE_SECONDS: Record<BaseGesture, number> = { idle: 0, talk: 2.4, present: 2.2, wave: 2.6 }

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/**
 * A croupier without a skeleton (an AI-sculpted mesh). Motion is procedural and whole-body:
 * breathing, a lean toward the wheel to launch the ball, nods while talking and a sway for wins.
 */
export class StaticDealer implements Dealer {
  readonly root = new THREE.Group()
  /** Pivot at the waist, so leans bend from the hips rather than the floor. */
  private readonly waist = new THREE.Group()
  private readonly body = new THREE.Group()
  private disposables: { dispose: () => void }[] = []
  private gesture: BaseGesture = 'idle'
  private gestureAt = 0
  private clock = 0
  private speech: { keys: VisemeKey[], startedAt: number, seconds: number } | null = null
  private speakHandle: SpeakHandle | null = null

  static async load (url: string, maxAnisotropy: number, figure = false): Promise<StaticDealer> {
    const dealer = new StaticDealer()
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    const gltf = await loader.loadAsync(url)
    const model = gltf.scene

    model.traverse(object => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      const material = mesh.material as THREE.MeshStandardMaterial
      // The AI-sculpted bust has flat, uniform materials; a textured figure keeps its own roughness map.
      if (!figure) { material.roughness = 0.75; material.metalness = 0 }
      if (material.map) material.map.anisotropy = maxAnisotropy
      dealer.disposables.push(mesh.geometry, material)
      if (material.map) dealer.disposables.push(material.map)
    })

    // Normalise: bust base on the origin, centred, scaled to life size.
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const scale = (figure ? FIGURE_HEIGHT : HEIGHT) / size.y
    model.scale.setScalar(scale)
    const center = box.getCenter(new THREE.Vector3())
    const pivot = figure ? HIP_ABOVE_FLOOR : 0
    model.position.set(-center.x * scale, -box.min.y * scale - pivot, -center.z * scale)

    dealer.waist.position.set(0, figure ? HIP_ABOVE_FLOOR : WAIST_ABOVE_FLOOR, figure ? 0 : SET_BACK)
    dealer.body.add(model)
    dealer.waist.add(dealer.body)
    dealer.root.add(dealer.waist)
    return dealer
  }

  play (gesture: Gesture) {
    this.gesture = baseGesture(gesture)
    this.gestureAt = this.clock
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

    // Idle: slow breathing and a gentle weight shift.
    let pitch = 0
    let roll = Math.sin(t * 0.6) * 0.012
    let yaw = Math.sin(t * 0.37) * 0.03
    let lift = Math.sin(t * 1.6) * 0.012
    const breathe = 1 + Math.sin(t * 1.6) * 0.006

    const length = GESTURE_SECONDS[this.gesture]
    const g = length ? Math.min(1, (t - this.gestureAt) / length) : 1
    const envelope = Math.sin(Math.PI * g)
    switch (this.gesture) {
      case 'present': pitch += 0.13 * ease(envelope); yaw += 0.18 * envelope; break
      case 'talk': pitch += 0.05 * envelope * (0.6 + 0.4 * Math.sin((t - this.gestureAt) * 7)); break
      case 'wave': roll += 0.08 * Math.sin((t - this.gestureAt) * 6) * envelope; lift += 0.08 * envelope; break
    }
    if (g >= 1) this.gesture = 'idle'

    // No mouth to animate: a small nod on each spoken vowel keeps the speech readable.
    if (this.speech) {
      const elapsed = t - this.speech.startedAt
      const keys = this.speech.keys
      let i = keys.length - 1
      while (i > 0 && keys[i].at > elapsed) i--
      const vowel = elapsed < this.speech.seconds && /aa|_E$|_I$|_O$|_U$/.test(keys[i]?.viseme ?? '')
      pitch += vowel ? 0.02 : 0
    }

    const damp = Math.min(1, dt * 8)
    this.body.rotation.x += (pitch - this.body.rotation.x) * damp
    this.body.rotation.y += (yaw - this.body.rotation.y) * damp
    this.body.rotation.z += (roll - this.body.rotation.z) * damp
    this.body.position.y += (lift - this.body.position.y) * damp
    this.body.scale.set(1, breathe, 1)
  }

  dispose () {
    this.speakHandle?.cancel()
    this.disposables.forEach(item => item.dispose())
  }
}
