import * as THREE from 'three'
import { createStage, goldMaterial, gradientTexture, labelTexture, viewZoom, type Stage } from './stage'

const INNER = 0.3
const OUTER = 1
const RIM = 1.09
const DEPTH = 0.14

/** Slice colours by what they pay. */
export const wheelHex = (multiplier: number) =>
  multiplier === 0 ? 0x1f1f2b : multiplier < 1 ? 0x8e2335 : multiplier < 2 ? 0xb88a2f : multiplier < 5 ? 0xe8c36a : 0x2fbf84

const easeOut = (t: number) => 1 - (1 - t) ** 4

/** The prize wheel in 3D: lacquered slices, a gold rim with pins, and a pointer that flicks past them. */
export class WheelScene {
  readonly #stage: Stage
  readonly #spinner = new THREE.Group()
  readonly #tilt = new THREE.Group()
  readonly #pointer = new THREE.Group()
  readonly #glow: THREE.Mesh
  #pins = 0
  #angle = 0
  #spin: { from: number, to: number, startedAt: number, ms: number, done: () => void } | null = null
  #dirty = true
  #seen = { width: 0, height: 0 }

  constructor (container: HTMLElement) {
    const stage = createStage(container, { fov: 32, bloom: 0.22, exposure: 0.8, reflections: 0.4 })
    this.#stage = stage
    const { scene, camera } = stage
    scene.background = stage.track(gradientTexture('#0a0a12', '#1c1020'))
    scene.add(new THREE.HemisphereLight(0xfff0d0, 0x20101a, 0.35))
    const key = new THREE.DirectionalLight(0xfff2dc, 1.0)
    key.position.set(-4, 6, 8)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xc8283c, 0.7)
    rim.position.set(5, -2, 4)
    scene.add(rim)

    // The wheel stands tilted back, facing a camera above and in front.
    this.#tilt.rotation.x = -0.72
    scene.add(this.#tilt)
    this.#tilt.add(this.#spinner)

    // Base disc and glow underneath.
    const base = new THREE.Mesh(new THREE.CylinderGeometry(RIM + 0.14, RIM + 0.2, 0.12, 64).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0c0c12, metalness: 0.7, roughness: 0.35 }))
    base.position.z = -0.12
    this.#tilt.add(base)
    this.#glow = new THREE.Mesh(new THREE.CircleGeometry(1.55, 64), new THREE.MeshBasicMaterial({ color: 0xe8c36a, transparent: true, opacity: 0.035, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.#glow.position.z = -0.3
    this.#tilt.add(this.#glow)

    // The gold rim and hub.
    const rimMesh = new THREE.Mesh(new THREE.TorusGeometry((RIM + OUTER) / 2, (RIM - OUTER) / 2 + 0.03, 24, 96), goldMaterial(0.22))
    rimMesh.position.z = DEPTH / 2
    this.#tilt.add(rimMesh)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(INNER, INNER + 0.03, 0.26, 48).rotateX(Math.PI / 2), goldMaterial(0.2))
    hub.position.z = DEPTH / 2 + 0.05
    this.#tilt.add(hub)
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 20), goldMaterial(0.12))
    cap.position.z = DEPTH / 2 + 0.2
    cap.scale.z = 0.7
    this.#tilt.add(cap)

    // The pointer: a gold flapper at the top, pivoting at its base.
    const flap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.36, 4).rotateX(Math.PI), goldMaterial(0.18))
    flap.position.y = -0.18
    this.#pointer.add(flap)
    this.#pointer.position.set(0, RIM + 0.03, DEPTH + 0.1)
    this.#tilt.add(this.#pointer)

    camera.position.set(0, 3.4, 4.2)
    camera.lookAt(0, 0.1, 0)
    stage.run((dt) => this.#frame(dt))
  }

  /** Builds the wheel from the multipliers around it; slice 0 sits at the top, the rest follow clockwise. */
  setSegments (segments: readonly number[]) {
    for (const child of [...this.#spinner.children]) {
      this.#spinner.remove(child)
      child.traverse(object => {
        const mesh = object as THREE.Mesh
        mesh.geometry?.dispose()
        const material = mesh.material as THREE.MeshStandardMaterial | undefined
        material?.map?.dispose()
        material?.dispose()
      })
    }
    const count = segments.length
    const width = (Math.PI * 2) / count
    const sliceShape = (centre: number) => {
      // Angles are clockwise from the top; the shape is drawn counter-clockwise from +X.
      const start = Math.PI / 2 - (centre + width / 2)
      const end = Math.PI / 2 - (centre - width / 2)
      const shape = new THREE.Shape()
      shape.absarc(0, 0, OUTER, start, end, false)
      shape.absarc(0, 0, INNER, end, start, true)
      shape.closePath()
      return shape
    }
    segments.forEach((multiplier, index) => {
      const centre = index * width
      const geometry = new THREE.ExtrudeGeometry(sliceShape(centre), { depth: DEPTH, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 12 })
      const colour = wheelHex(multiplier)
      const material = new THREE.MeshPhysicalMaterial({ color: colour, metalness: multiplier >= 2 ? 0.55 : 0.2, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 })
      this.#spinner.add(new THREE.Mesh(geometry, material))

      const text = multiplier === 0 ? '0' : `${multiplier}×`
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.2),
        new THREE.MeshBasicMaterial({ map: labelTexture(text, { color: multiplier === 0 || multiplier < 1 ? '#f5efe2' : '#22180a', font: '700 92px "JetBrains Mono", ui-monospace, monospace' }), transparent: true })
      )
      // Reads outward along the slice.
      const radius = 0.66
      label.position.set(Math.sin(centre) * radius, Math.cos(centre) * radius, DEPTH + 0.02)
      label.rotation.z = Math.PI / 2 - centre
      this.#spinner.add(label)
    })

    // Pins between the slices.
    this.#pins = count
    for (let i = 0; i < count; i++) {
      const angle = (i + 0.5) * width
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 12).rotateX(Math.PI / 2), goldMaterial(0.15))
      pin.position.set(Math.sin(angle) * (OUTER + 0.005), Math.cos(angle) * (OUTER + 0.005), DEPTH)
      this.#spinner.add(pin)
    }
    this.#spinner.rotation.z = -this.#angle
    this.#dirty = true
  }

  /** Spins until `degrees` (clockwise, from where slice 0 is under the pointer) over `ms`. */
  spinTo (degrees: number, ms: number, done: () => void) {
    this.#spin = { from: this.#angle, to: (degrees * Math.PI) / 180, startedAt: performance.now(), ms, done }
  }

  /** Where the wheel rests now, in degrees. */
  get degrees () { return (this.#angle * 180) / Math.PI }

  #frame (dt: number): boolean {
    const resized = this.#seen.width !== this.#stage.width || this.#seen.height !== this.#stage.height
    this.#seen = { width: this.#stage.width, height: this.#stage.height }
    const { camera } = this.#stage
    if (resized) {
      // Keep the whole wheel in view on any shape of box.
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
      // The wheel stands tilted, so its near edge is wider than it looks flat: leave room at the sides.
      const distance = Math.max(2.65 / (2 * tan * 0.8), 3.5 / (2 * tan * camera.aspect)) / viewZoom
      camera.position.set(0, distance * 0.62, distance * 0.78)
      camera.lookAt(0, 0.12, 0)
      this.#dirty = true
    }

    let moving = false
    let flick = 0
    if (this.#spin) {
      moving = true
      const { from, to, startedAt, ms, done } = this.#spin
      const t = Math.min(1, (performance.now() - startedAt) / ms)
      const next = from + (to - from) * easeOut(t)
      // The pointer is knocked each time a pin passes it.
      if (this.#pins) {
        const slice = (Math.PI * 2) / this.#pins
        const phase = ((next / slice) % 1 + 1) % 1
        const speed = Math.abs(next - this.#angle) / Math.max(dt, 0.001)
        flick = phase > 0.5 ? Math.min(1, speed / 6) * (1 - phase) * 2 * 0.6 : 0
      }
      this.#angle = next
      if (t >= 1) { this.#spin = null; done() }
    }
    this.#spinner.rotation.z = -this.#angle
    this.#pointer.rotation.z = -flick * 0.7
    this.#glow.scale.setScalar(1 + (moving ? 0.04 : 0))

    if (moving || this.#dirty) { this.#dirty = false; return true }
    return false
  }

  dispose () {
    this.#stage.dispose()
  }
}
