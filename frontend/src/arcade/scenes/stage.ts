import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** How close the camera frames a scene (`?zoom=1.8`). Left at 1 for players; used to render the cards' artwork. */
export const viewZoom = typeof window === 'undefined' ? 1 : Math.min(3, Math.max(0.5, Number(new URLSearchParams(window.location.search).get('zoom')) || 1))

export interface Stage {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  /** Pixels per world unit at distance 1, for sizing particles. */
  readonly pixelScale: number
  readonly width: number
  readonly height: number
  /** Runs `frame(seconds since last, seconds since start)` every animation frame until disposed; returning false skips drawing. */
  run (frame: (dt: number, time: number) => boolean | void): void
  /** Draws one frame now (for scenes that only move when asked). */
  draw (): void
  /** Takes ownership of something with dispose(), so it is freed with the stage. */
  track<T extends { dispose: () => void }> (item: T): T
  dispose (): void
}

export interface StageOptions {
  fov?: number
  /** Bloom strength; 0 turns the pass off. */
  bloom?: number
  exposure?: number
  /** How much the room lighting reflects in metals (0 to 1+). */
  reflections?: number
}

/**
 * A three.js stage in the theme: neutral tone mapping, soft studio reflections, and a gentle
 * bloom so gold and glow read as light. Sizes itself to its container.
 */
export function createStage (container: HTMLElement, { fov = 40, bloom = 0.45, exposure = 1, reflections = 0.6 }: StageOptions = {}): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = exposure
  renderer.domElement.className = 'arcade-gl'
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 400)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04)
  scene.environment = environment.texture
  scene.environmentIntensity = reflections

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), bloom, 0.7, 0.82)
  bloomPass.enabled = bloom > 0
  composer.addPass(bloomPass)
  composer.addPass(new OutputPass())

  const owned: Array<{ dispose: () => void }> = []
  const state = { width: 1, height: 1, pixelScale: 1 }
  const resize = () => {
    const { width, height } = container.getBoundingClientRect()
    if (width < 1 || height < 1) return
    state.width = width
    state.height = height
    renderer.setSize(width, height, false)
    composer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    state.pixelScale = height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) * Math.min(window.devicePixelRatio, 1.5)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()

  let raf = 0
  let handler: ((dt: number, time: number) => boolean | void) | null = null
  let last = 0
  let started = 0
  const loop = (now: number) => {
    if (!started) started = last = now
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    // A frame function that returns false has nothing new to show, so the GPU rests.
    if (handler?.(dt, (now - started) / 1000) !== false) composer.render()
    raf = requestAnimationFrame(loop)
  }

  return {
    renderer,
    scene,
    camera,
    get pixelScale () { return state.pixelScale },
    get width () { return state.width },
    get height () { return state.height },
    run (frame) { handler = frame; if (!raf) raf = requestAnimationFrame(loop) },
    draw () { composer.render() },
    track (item) { owned.push(item); return item },
    dispose () {
      cancelAnimationFrame(raf)
      raf = 0
      observer.disconnect()
      owned.forEach(item => item.dispose())
      scene.traverse(object => {
        const mesh = object as THREE.Mesh
        mesh.geometry?.dispose()
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined
        for (const item of Array.isArray(material) ? material : material ? [material] : []) {
          for (const value of Object.values(item)) if (value instanceof THREE.Texture) value.dispose()
          item.dispose()
        }
      })
      environment.dispose()
      pmrem.dispose()
      composer.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }
}

// ─── Materials ───────────────────────────────────────────────────────

export const GOLD = 0xe8c36a

export const goldMaterial = (roughness = 0.28) => new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness })
export const noirMaterial = (color = 0x15151c, roughness = 0.35) => new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness })
export const glowMaterial = (color: number, intensity = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 })

/** A vertical gradient to sit behind a scene. */
export function gradientTexture (top: string, bottom: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 256
  const context = canvas.getContext('2d')!
  const fill = context.createLinearGradient(0, 0, 0, 256)
  fill.addColorStop(0, top)
  fill.addColorStop(1, bottom)
  context.fillStyle = fill
  context.fillRect(0, 0, 4, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Text drawn onto a texture, for labels on slots, slices and cloths. */
export function labelTexture (text: string, { color = '#f5efe2', font = '700 96px "JetBrains Mono", ui-monospace, monospace', width = 256, height = 128, background }: { color?: string, font?: string, width?: number, height?: number, background?: string } = {}): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  if (background) { context.fillStyle = background; context.fillRect(0, 0, width, height) }
  context.font = font
  context.fillStyle = color
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, width / 2, height / 2 + 4)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

// ─── Particles ───────────────────────────────────────────────────────

/** Glowing additive points: exhaust, sparks, dust and explosions. */
export class Particles {
  readonly points: THREE.Points
  readonly #capacity: number
  readonly #position: Float32Array
  readonly #velocity: Float32Array
  readonly #age: Float32Array
  readonly #life: Float32Array
  readonly #baseSize: Float32Array
  readonly #size: Float32Array
  readonly #alpha: Float32Array
  readonly #uniforms: { uColor: { value: THREE.Color }, uScale: { value: number }, uOpacity: { value: number } }
  readonly #gravity: number
  #cursor = 0

  constructor (capacity: number, color: number, { gravity = 0, blending = THREE.AdditiveBlending, opacity = 1 }: { gravity?: number, blending?: THREE.Blending, opacity?: number } = {}) {
    this.#capacity = capacity
    this.#gravity = gravity
    this.#position = new Float32Array(capacity * 3).fill(1e5)
    this.#velocity = new Float32Array(capacity * 3)
    this.#age = new Float32Array(capacity).fill(1)
    this.#life = new Float32Array(capacity).fill(1)
    this.#baseSize = new Float32Array(capacity)
    this.#size = new Float32Array(capacity)
    this.#alpha = new Float32Array(capacity)
    this.#uniforms = { uColor: { value: new THREE.Color(color) }, uScale: { value: 500 }, uOpacity: { value: opacity } }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.#position, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.#size, 1))
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.#alpha, 1))
    const material = new THREE.ShaderMaterial({
      uniforms: this.#uniforms,
      transparent: true,
      depthWrite: false,
      blending,
      vertexShader: `
        attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -view.z);
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uOpacity; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d) * vAlpha * uOpacity;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor * (1.0 + a), a);
        }`
    })
    this.points = new THREE.Points(geometry, material)
    this.points.frustumCulled = false
  }

  /** Whether any particle is still showing. */
  alive (): boolean {
    for (let i = 0; i < this.#capacity; i++) if (this.#age[i] < this.#life[i]) return true
    return false
  }

  setColor (color: number) { this.#uniforms.uColor.value.set(color) }

  emit (x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number) {
    const i = this.#cursor
    this.#cursor = (this.#cursor + 1) % this.#capacity
    this.#position.set([x, y, z], i * 3)
    this.#velocity.set([vx, vy, vz], i * 3)
    this.#age[i] = 0
    this.#life[i] = life
    this.#baseSize[i] = size
  }

  update (dt: number, pixelScale: number) {
    this.#uniforms.uScale.value = pixelScale
    for (let i = 0; i < this.#capacity; i++) {
      if (this.#age[i] >= this.#life[i]) { this.#alpha[i] = 0; continue }
      this.#age[i] += dt
      const t = Math.min(1, this.#age[i] / this.#life[i])
      const o = i * 3
      this.#velocity[o + 1] -= this.#gravity * dt
      this.#position[o] += this.#velocity[o] * dt
      this.#position[o + 1] += this.#velocity[o + 1] * dt
      this.#position[o + 2] += this.#velocity[o + 2] * dt
      this.#alpha[i] = (1 - t) * (1 - t)
      this.#size[i] = this.#baseSize[i] * (0.4 + 0.9 * (1 - t))
    }
    const geometry = this.points.geometry
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.aSize.needsUpdate = true
    geometry.attributes.aAlpha.needsUpdate = true
  }

  dispose () {
    this.points.geometry.dispose()
    ;(this.points.material as THREE.Material).dispose()
  }
}
