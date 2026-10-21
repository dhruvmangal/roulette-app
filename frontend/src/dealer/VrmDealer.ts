import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { speak, visemeTrack, type SpeakHandle, type Viseme, type VisemeKey } from './speech'
import { baseGesture, type BaseGesture, type Dealer, type Gesture, type SayOptions } from './types'

/** VRM is in metres; the table works in 25 cm units. */
const SCALE = 4
const GESTURE_SECONDS: Record<BaseGesture, number> = { idle: 0, talk: 2.4, present: 2.4, wave: 2.8 }

/** Our spelling-based visemes reduced to the five VRM mouth shapes. */
const VOWEL_FOR: Record<Viseme, ['a' | 'i' | 'u' | 'e' | 'o', number]> = {
  AA_VI_00_Sil: ['a', 0], AA_VI_01_PP: ['u', 0.15], AA_VI_02_FF: ['i', 0.3], AA_VI_03_TH: ['e', 0.35], AA_VI_04_DD: ['e', 0.4],
  AA_VI_05_KK: ['a', 0.35], AA_VI_06_CH: ['u', 0.45], AA_VI_07_SS: ['i', 0.4], AA_VI_08_nn: ['e', 0.25], AA_VI_09_RR: ['o', 0.35],
  AA_VI_10_aa: ['a', 0.9], AA_VI_11_E: ['e', 0.8], AA_VI_12_I: ['i', 0.75], AA_VI_13_O: ['o', 0.85], AA_VI_14_U: ['u', 0.8]
}

interface Bind { mesh: THREE.Mesh, index: number, weight: number }
interface VrmJson {
  humanoid?: { humanBones?: { bone: string, node: number }[] }
  blendShapeMaster?: { blendShapeGroups?: { presetName?: string, name?: string, binds?: { mesh: number, index: number, weight: number }[] }[] }
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/**
 * A VRM 0.x avatar (VRoid): humanoid bones for procedural gestures, and the standard
 * A/I/U/E/O, blink and joy expressions for lip-sync and smiles. No extra runtime needed.
 */
export class VrmDealer implements Dealer {
  readonly root = new THREE.Group()
  private bones = new Map<string, THREE.Object3D>()
  private rest = new Map<string, THREE.Quaternion>()
  private expressions = new Map<string, Bind[]>()
  private weights = new Map<string, number>()
  private disposables: { dispose: () => void }[] = []
  private gesture: BaseGesture = 'idle'
  private gestureAt = 0
  private clock = 0
  private blinkIn = 2
  private blink = 0
  private speech: { keys: VisemeKey[], startedAt: number, seconds: number } | null = null
  private speakHandle: SpeakHandle | null = null

  static async load (url: string, maxAnisotropy: number): Promise<VrmDealer> {
    const dealer = new VrmDealer()
    const gltf: GLTF = await new GLTFLoader().loadAsync(url)
    const vrm = (gltf.parser.json.extensions?.VRM ?? {}) as VrmJson

    gltf.scene.traverse(object => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.frustumCulled = false
      const materials = ([] as THREE.Material[]).concat(mesh.material)
      // VRoid exports unlit fallbacks; toon shading picks up the table lights like MToon would.
      const toon = materials.map(material => {
        const source = material as THREE.MeshBasicMaterial
        const result = new THREE.MeshToonMaterial({
          map: source.map, color: source.color, transparent: source.transparent, alphaTest: source.alphaTest,
          side: source.side, opacity: source.opacity, depthWrite: source.depthWrite
        })
        if (source.map) source.map.anisotropy = maxAnisotropy
        material.dispose()
        dealer.disposables.push(result)
        if (result.map) dealer.disposables.push(result.map)
        return result
      })
      mesh.material = Array.isArray(mesh.material) ? toon : toon[0]
      dealer.disposables.push(mesh.geometry)
    })

    for (const { bone, node } of vrm.humanoid?.humanBones ?? []) {
      const object = await gltf.parser.getDependency('node', node) as THREE.Object3D
      dealer.bones.set(bone, object)
      dealer.rest.set(bone, object.quaternion.clone())
    }
    const meshes = await gltf.parser.getDependencies('mesh') as THREE.Object3D[]
    for (const group of vrm.blendShapeMaster?.blendShapeGroups ?? []) {
      const key = (group.presetName && group.presetName !== 'unknown' ? group.presetName : group.name ?? '').toLowerCase()
      const binds: Bind[] = []
      for (const bind of group.binds ?? []) {
        meshes[bind.mesh]?.traverse(object => {
          const mesh = object as THREE.Mesh
          if (mesh.isMesh && mesh.morphTargetInfluences) binds.push({ mesh, index: bind.index, weight: bind.weight / 100 })
        })
      }
      if (key && binds.length) dealer.expressions.set(key, binds)
    }

    // VRM 0.x faces -Z; the player sits on +Z.
    gltf.scene.rotation.y = Math.PI
    gltf.scene.scale.setScalar(SCALE)
    dealer.root.add(gltf.scene)
    dealer.pose(0)
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

  /** Rotates a humanoid bone by Euler offsets (radians) from its rest pose. */
  private turn (bone: string, x: number, y: number, z: number) {
    const object = this.bones.get(bone)
    const rest = this.rest.get(bone)
    if (!object || !rest) return
    object.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)))
  }

  private pose (t: number) {
    const g = GESTURE_SECONDS[this.gesture] ? Math.min(1, (t - this.gestureAt) / GESTURE_SECONDS[this.gesture]) : 1
    const envelope = ease(Math.sin(Math.PI * g))
    const local = t - this.gestureAt
    const breathe = Math.sin(t * 1.7)

    // Relaxed stance: arms down from the T-pose, elbows slightly bent, a gentle sway.
    let rightArmZ = -1.34; let rightArmX = 0; let rightElbowY = -0.25; let rightElbowZ = 0
    const leftArmZ = 1.34 + breathe * 0.01; const leftElbowY = 0.25
    let headX = 0.06 + Math.sin(t * 0.5) * 0.02; let headY = Math.sin(t * 0.33) * 0.06
    let spineX = breathe * 0.012

    switch (this.gesture) {
      case 'present': // sweep the right hand forward over the wheel, eyes on it
        rightArmZ += 0.75 * envelope; rightArmX -= 0.9 * envelope; rightElbowY -= 0.5 * envelope
        headX += 0.22 * envelope; spineX += 0.12 * envelope
        break
      case 'wave':
        rightArmZ += 2.2 * envelope; rightElbowZ = (0.5 + 0.35 * Math.sin(local * 9)) * envelope
        break
      case 'talk':
        headX += 0.05 * Math.sin(local * 6) * envelope; headY += 0.05 * Math.sin(local * 2.3) * envelope
        rightArmX -= 0.25 * envelope; rightElbowY -= 0.6 * envelope
        break
    }
    if (g >= 1) this.gesture = 'idle'

    this.turn('spine', spineX, 0, 0)
    this.turn('chest', breathe * 0.01, 0, 0)
    this.turn('neck', headX * 0.4, headY * 0.4, 0)
    this.turn('head', headX * 0.6, headY * 0.6, 0)
    this.turn('rightUpperArm', rightArmX, 0, rightArmZ)
    this.turn('rightLowerArm', 0, rightElbowY, rightElbowZ)
    this.turn('leftUpperArm', 0, 0, leftArmZ)
    this.turn('leftLowerArm', 0, leftElbowY, 0)
  }

  private setExpression (name: string, value: number) {
    this.weights.set(name, value)
  }

  update (dt: number) {
    this.clock += dt
    this.pose(this.clock)

    this.blinkIn -= dt
    if (this.blinkIn <= 0) { this.blink = 1; this.blinkIn = 2.5 + Math.random() * 3.5 }
    const blink = this.blink > 0 ? Math.sin(Math.PI * (1 - this.blink)) : 0
    this.blink = Math.max(0, this.blink - dt * 7)

    const mouth: Record<string, number> = { a: 0, i: 0, u: 0, e: 0, o: 0 }
    if (this.speech) {
      const elapsed = this.clock - this.speech.startedAt
      const keys = this.speech.keys
      let i = keys.length - 1
      while (i > 0 && keys[i].at > elapsed) i--
      if (elapsed < this.speech.seconds && keys[i]) {
        const [vowel, amount] = VOWEL_FOR[keys[i].viseme]
        mouth[vowel] = amount
      }
    }
    const ease = Math.min(1, dt * 18)
    for (const vowel of Object.keys(mouth)) {
      const current = this.weights.get(vowel) ?? 0
      this.setExpression(vowel, current + (mouth[vowel] - current) * ease)
    }
    this.setExpression('blink', blink)
    this.setExpression('joy', this.speech ? 0.15 : 0.3)

    // Expressions can share morph targets, so sum their binds before applying.
    const totals = new Map<THREE.Mesh, Map<number, number>>()
    for (const [name, binds] of this.expressions) {
      const weight = this.weights.get(name) ?? 0
      for (const { mesh, index, weight: bindWeight } of binds) {
        let perMesh = totals.get(mesh)
        if (!perMesh) totals.set(mesh, perMesh = new Map())
        perMesh.set(index, (perMesh.get(index) ?? 0) + weight * bindWeight)
      }
    }
    for (const [mesh, perMesh] of totals) for (const [index, value] of perMesh) mesh.morphTargetInfluences![index] = Math.min(1, value)
  }

  dispose () {
    this.speakHandle?.cancel()
    this.disposables.forEach(item => item.dispose())
  }
}
