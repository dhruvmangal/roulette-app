import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { speak, visemeTrack, type SpeakHandle, type Viseme, type VisemeKey } from './speech'
import { baseGesture, type BaseGesture, type Dealer, type Gesture, type SayOptions } from './types'

const BASE = `${import.meta.env.BASE_URL}dealer/`
/** Rocketbox units are centimetres; the wheel's rotor radius (1 unit) is about 25 cm. */
const SCALE = 1 / 25
const VISEMES: Viseme[] = [
  'AA_VI_00_Sil', 'AA_VI_01_PP', 'AA_VI_02_FF', 'AA_VI_03_TH', 'AA_VI_04_DD', 'AA_VI_05_KK', 'AA_VI_06_CH',
  'AA_VI_07_SS', 'AA_VI_08_nn', 'AA_VI_09_RR', 'AA_VI_10_aa', 'AA_VI_11_E', 'AA_VI_12_I', 'AA_VI_13_O', 'AA_VI_14_U'
]
const GESTURE_SECONDS: Record<BaseGesture, number> = { idle: 0, talk: 3.2, present: 3.4, wave: 3.2 }

interface Speech { keys: VisemeKey[], startedAt: number, seconds: number }

/** The croupier: a skinned Rocketbox avatar with body clips, blinking and viseme lip-sync. */
export class DealerRig implements Dealer {
  readonly root = new THREE.Group()
  private mixer: THREE.AnimationMixer | null = null
  private actions = new Map<BaseGesture, THREE.AnimationAction>()
  private current: THREE.AnimationAction | null = null
  private gestureTimer = 0
  private faces: THREE.Mesh[] = []
  private disposables: { dispose: () => void }[] = []
  private speech: Speech | null = null
  private speakHandle: SpeakHandle | null = null
  private blinkIn = 2
  private blink = 0
  private smile = 0.25
  private clock = 0
  private disposed = false

  static async load (maxAnisotropy: number): Promise<DealerRig> {
    const rig = new DealerRig()
    const textureLoader = new THREE.TextureLoader()
    const texture = (file: string, color = true) => {
      const map = textureLoader.load(BASE + file)
      map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
      map.anisotropy = maxAnisotropy
      rig.disposables.push(map)
      return map
    }
    const gltf = await new GLTFLoader().loadAsync(BASE + 'dealer.glb')
    if (rig.disposed) return rig

    const materials: Record<string, THREE.Material> = {
      f014_head: new THREE.MeshPhysicalMaterial({ map: texture('head_color.jpg'), normalMap: texture('head_normal.jpg', false), roughness: 0.55, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffd9c9') }),
      f014_body: new THREE.MeshStandardMaterial({ map: texture('body_color.jpg'), normalMap: texture('body_normal.jpg', false), roughness: 0.7 }),
      f014_opacity: new THREE.MeshStandardMaterial({ map: texture('opacity_color.png'), alphaTest: 0.35, transparent: false, side: THREE.DoubleSide, roughness: 0.6 })
    }
    Object.values(materials).forEach(material => rig.disposables.push(material))

    gltf.scene.traverse(object => {
      const mesh = object as THREE.SkinnedMesh
      if (!mesh.isMesh) return
      ;(mesh.material as THREE.Material).dispose()
      mesh.material = materials[mesh.name] ?? materials.f014_body
      mesh.castShadow = true
      mesh.frustumCulled = false
      rig.disposables.push(mesh.geometry)
      if (mesh.morphTargetDictionary) rig.faces.push(mesh)
    })
    gltf.scene.scale.setScalar(SCALE)
    rig.root.add(gltf.scene)

    rig.mixer = new THREE.AnimationMixer(gltf.scene)
    for (const clip of gltf.animations) {
      const action = rig.mixer.clipAction(clip)
      if (clip.name !== 'idle') { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true }
      rig.actions.set(clip.name as BaseGesture, action)
    }
    rig.play('idle', 0)
    return rig
  }

  play (requested: Gesture, fade = 0.45) {
    const gesture = baseGesture(requested)
    const next = this.actions.get(gesture)
    if (!next || !this.mixer) return
    next.reset().setEffectiveWeight(1).play()
    if (this.current && this.current !== next) this.current.crossFadeTo(next, fade, false)
    this.current = next
    this.gestureTimer = GESTURE_SECONDS[gesture]
  }

  /** Speaks a line with lip-sync, optionally with a body gesture. */
  say (text: string, options: SayOptions) {
    this.speakHandle?.cancel()
    if (options.gesture) this.play(options.gesture)
    options.onCaption?.(text)
    this.speakHandle = speak(text, options.muted, seconds => {
      this.speech = { keys: visemeTrack(text, seconds), startedAt: this.clock, seconds }
    }, () => {
      this.speech = null
      options.onCaption?.(null)
    })
  }

  update (dt: number) {
    this.clock += dt
    this.mixer?.update(dt)
    if (this.gestureTimer > 0) {
      this.gestureTimer -= dt
      if (this.gestureTimer <= 0) this.play('idle', 0.8)
    }
    this.updateFace(dt)
  }

  private updateFace (dt: number) {
    // Blink every few seconds.
    this.blinkIn -= dt
    if (this.blinkIn <= 0) { this.blink = 1; this.blinkIn = 2.5 + Math.random() * 3.5 }
    const blinkWeight = this.blink > 0 ? Math.sin(Math.PI * (1 - this.blink)) : 0
    this.blink = Math.max(0, this.blink - dt * 7)

    // Visemes: blend toward the key active at this moment of the line.
    const targets = new Map<string, number>()
    if (this.speech) {
      const elapsed = this.clock - this.speech.startedAt
      const keys = this.speech.keys
      let i = keys.length - 1
      while (i > 0 && keys[i].at > elapsed) i--
      if (elapsed < this.speech.seconds && keys[i]) targets.set(keys[i].viseme, keys[i].viseme === 'AA_VI_00_Sil' ? 0.2 : 0.85)
    }
    const smileTarget = this.speech ? 0.15 : 0.3

    this.smile += (smileTarget - this.smile) * Math.min(1, dt * 3)
    const ease = Math.min(1, dt * 18)
    for (const mesh of this.faces) {
      const dictionary = mesh.morphTargetDictionary!
      const influences = mesh.morphTargetInfluences!
      for (const viseme of VISEMES) {
        const index = dictionary[viseme]
        if (index !== undefined) influences[index] += ((targets.get(viseme) ?? 0) - influences[index]) * ease
      }
      for (const [name, value] of [['AK_09_EyeBlinkLeft', blinkWeight], ['AK_10_EyeBlinkRight', blinkWeight], ['AK_44_MouthSmileLeft', this.smile], ['AK_45_MouthSmileRight', this.smile]] as const) {
        const index = dictionary[name]
        if (index !== undefined) influences[index] = value
      }
    }
  }

  dispose () {
    this.disposed = true
    this.speakHandle?.cancel()
    this.mixer?.stopAllAction()
    this.disposables.forEach(item => item.dispose())
  }
}
