import * as THREE from 'three'
import { Particles, createStage, glowMaterial, goldMaterial, gradientTexture, labelTexture, viewZoom, type Stage } from './stage'

const SPACING = 1
const ROW_HEIGHT = 0.9
const PEG_RADIUS = 0.095
const BALL_RADIUS = 0.3
const SLOT_DEPTH = 0.5

export interface DropHandlers {
  /** The ball hit a peg of this row (0-based). */
  onPeg: (row: number) => void
  onLand: (slot: number) => void
}

interface Drop extends DropHandlers {
  path: number[]
  startedAt: number
  stepMs: number
  lastPeg: number
}

/** What a slot pays decides its colour. */
export const slotHex = (multiplier: number) => (multiplier < 1 ? 0x8e2335 : multiplier < 2 ? 0xb88a2f : multiplier < 10 ? 0xe8c36a : 0x59d39a)

/** The Plinko board in 3D: gold pegs, a chrome-gold ball with a moving light, glowing slots. */
export class PlinkoScene {
  readonly #stage: Stage
  readonly #board = new THREE.Group()
  readonly #ball: THREE.Mesh
  readonly #light = new THREE.PointLight(0xffd488, 0, 7, 1.6)
  readonly #trail = new Particles(160, 0xffc860)
  readonly #burst = new Particles(160, 0xffe0a0, { gravity: 6 })
  #rows = 0
  #pegs: THREE.InstancedMesh | null = null
  #pegCentres: THREE.Vector3[] = []
  #pegPulse: number[] = []
  #slotPlates: THREE.Mesh[] = []
  #slotPulse: number[] = []
  #drop: Drop | null = null
  #dirty = true
  #seen = { width: 0, height: 0 }
  #framed = ''
  #matrix = new THREE.Matrix4()

  constructor (container: HTMLElement) {
    const stage = createStage(container, { fov: 30, bloom: 0.3, exposure: 1.0, reflections: 0.9 })
    this.#stage = stage
    const { scene } = stage
    scene.background = stage.track(gradientTexture('#0a0a12', '#1a1020'))

    scene.add(new THREE.HemisphereLight(0xfff0d0, 0x20101a, 0.7))
    const key = new THREE.DirectionalLight(0xfff2dc, 2.4)
    key.position.set(-5, 8, 10)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xc8283c, 1.0)
    rim.position.set(6, -2, 5)
    scene.add(rim)
    scene.add(this.#light)

    this.#ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 40, 28), new THREE.MeshStandardMaterial({ color: 0xffe3a0, metalness: 1, roughness: 0.12, emissive: 0xb07a18, emissiveIntensity: 0.35 }))
    this.#ball.visible = false
    scene.add(this.#board, this.#ball, this.#trail.points, this.#burst.points)

    stage.run((dt, time) => this.#frame(dt, time))
  }

  /** Lays out the board for `rows` rows and the slot payouts, left to right. */
  setBoard (rows: number, multipliers: readonly number[]) {
    this.#rows = rows
    for (const child of [...this.#board.children]) {
      this.#board.remove(child)
      child.traverse(object => {
        const mesh = object as THREE.Mesh
        mesh.geometry?.dispose()
        const material = mesh.material as THREE.Material | undefined
        if (material) { (material as THREE.MeshBasicMaterial).map?.dispose(); material.dispose() }
      })
    }
    const width = rows + 2.4
    const top = 0.9
    const slotY = -rows * ROW_HEIGHT - 0.85
    const bottom = slotY - 0.8
    const height = top - bottom
    const centreY = (top + bottom) / 2

    // The panel behind, in a gold frame.
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.3), new THREE.MeshStandardMaterial({ color: 0x0d0d15, metalness: 0.6, roughness: 0.4 }))
    panel.position.set(0, centreY, -0.4)
    this.#board.add(panel)
    const frameMaterial = goldMaterial(0.22)
    for (const [w, h, x, y] of [[width + 0.3, 0.16, 0, top + 0.08], [width + 0.3, 0.16, 0, bottom - 0.08], [0.16, height, -width / 2 - 0.08, centreY], [0.16, height, width / 2 + 0.08, centreY]] as const) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.6), frameMaterial)
      bar.position.set(x, y, -0.1)
      this.#board.add(bar)
    }

    // Pegs: gold studs.
    const total = Array.from({ length: rows }, (_, row) => row + 3).reduce((sum, count) => sum + count, 0)
    const pegs = new THREE.InstancedMesh(new THREE.SphereGeometry(PEG_RADIUS * 1.15, 24, 18).scale(1, 1, 1.7), goldMaterial(0.2), total)
    pegs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(total * 3).fill(1), 3)
    this.#pegCentres = []
    this.#pegPulse = new Array(total).fill(0)
    let index = 0
    for (let row = 0; row < rows; row++) {
      for (let peg = 0; peg < row + 3; peg++) {
        const centre = new THREE.Vector3((peg - (row + 2) / 2) * SPACING, -row * ROW_HEIGHT, 0)
        this.#pegCentres.push(centre)
        pegs.setMatrixAt(index++, this.#matrix.makeTranslation(centre.x, centre.y, centre.z))
      }
    }
    pegs.instanceMatrix.needsUpdate = true
    this.#pegs = pegs
    this.#board.add(pegs)

    // Slots: dividers, a glowing plate and a label for each.
    this.#slotPlates = []
    this.#slotPulse = new Array(multipliers.length).fill(0)
    multipliers.forEach((multiplier, slot) => {
      const x = (slot - rows / 2) * SPACING
      const plate = new THREE.Mesh(new THREE.BoxGeometry(SPACING - 0.14, 0.58, SLOT_DEPTH), glowMaterial(slotHex(multiplier), 0.1))
      plate.position.set(x, slotY, 0.02)
      this.#board.add(plate)
      this.#slotPlates.push(plate)
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(SPACING - 0.2, (SPACING - 0.2) / 2),
        new THREE.MeshBasicMaterial({ map: labelTexture(multiplier >= 100 ? multiplier.toFixed(0) : String(multiplier), { color: multiplier < 2 ? '#f5efe2' : '#22180a', font: '700 84px "JetBrains Mono", ui-monospace, monospace' }), transparent: true })
      )
      label.position.set(x, slotY, SLOT_DEPTH / 2 + 0.04)
      this.#board.add(label)
    })
    for (let slot = 0; slot <= multipliers.length; slot++) {
      const divider = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, SLOT_DEPTH + 0.2), frameMaterial)
      divider.position.set((slot - rows / 2 - 0.5) * SPACING, slotY, 0.02)
      this.#board.add(divider)
    }

    this.#board.userData = { width, height, centreY }
    this.#framed = ''
    this.#dirty = true
  }

  /** Lets the ball go along `path` (0 left, 1 right per row), one row every `stepMs`. */
  drop (path: number[], stepMs: number, handlers: DropHandlers) {
    this.#drop = { path, startedAt: performance.now(), stepMs, lastPeg: -1, ...handlers }
    this.#ball.visible = true
  }

  /** Where the ball rests above row `row`'s pegs (the last row is the slot). */
  #rest (path: number[], row: number): THREE.Vector3 {
    const rights = path.slice(0, row).reduce((sum, step) => sum + step, 0)
    const x = (rights - row / 2) * SPACING
    const y = row === path.length ? -this.#rows * ROW_HEIGHT - 0.85 + 0.1 : -row * ROW_HEIGHT + PEG_RADIUS + BALL_RADIUS
    return new THREE.Vector3(x, y, 0.02)
  }

  #fit () {
    const { width, height, centreY } = this.#board.userData as { width: number, height: number, centreY: number }
    if (!width) return
    const { camera } = this.#stage
    const key = `${this.#stage.width}x${this.#stage.height}:${this.#rows}`
    if (key === this.#framed) return
    this.#framed = key
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    const distance = Math.max((height + 0.9) / (2 * tan), (width + 0.9) / (2 * tan * camera.aspect)) / viewZoom
    camera.position.set(0, centreY + distance * 0.1, distance)
    camera.lookAt(0, centreY - 0.05, 0)
    this.#dirty = true
  }

  #frame (dt: number, time: number): boolean {
    const resized = this.#seen.width !== this.#stage.width || this.#seen.height !== this.#stage.height
    this.#seen = { width: this.#stage.width, height: this.#stage.height }
    if (resized) this.#dirty = true
    this.#fit()

    const now = performance.now()
    const drop = this.#drop
    let animating = false

    if (drop) {
      animating = true
      const { path, stepMs } = drop
      const progress = (now - drop.startedAt) / stepMs
      const row = Math.min(path.length - 1, Math.max(0, Math.floor(progress)))
      const t = Math.min(1, progress - row)
      const from = this.#rest(path, row)
      const to = this.#rest(path, row + 1)
      const ease = 1 - (1 - t) * (1 - t)
      const position = new THREE.Vector3(
        from.x + (to.x - from.x) * ease,
        from.y + (to.y - from.y) * t * t - Math.sin(t * Math.PI) * ROW_HEIGHT * 0.3,
        0.02 + Math.sin(progress * 5) * 0.03
      )
      this.#ball.position.copy(position)
      this.#ball.rotation.z -= (to.x - from.x) * dt * 6 + dt * 3
      this.#light.position.set(position.x, position.y, 2.2)
      this.#light.intensity = 14
      this.#trail.emit(position.x, position.y, 0, (Math.random() - 0.5) * 0.3, 0.2 + Math.random() * 0.3, 0.1, 0.45, 0.28)

      const peg = Math.floor(progress)
      if (peg !== drop.lastPeg && peg >= 0 && peg < path.length) {
        drop.lastPeg = peg
        const rights = path.slice(0, peg).reduce((sum, step) => sum + step, 0)
        const first = peg * (peg + 5) / 2 // pegs in the rows above: 3 + 4 + ... + (peg + 2)
        this.#pegPulse[first + rights + 1] = 1
        drop.onPeg(peg)
      }
      if (progress >= path.length) {
        const slot = path.reduce((sum, step) => sum + step, 0)
        this.#slotPulse[slot] = 1
        const plate = this.#slotPlates[slot]
        for (let i = 0; i < 40; i++) this.#burst.emit(plate.position.x, plate.position.y + 0.4, 0.4, (Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.2) * 2, 0.7 + Math.random() * 0.6, 0.2 + Math.random() * 0.25)
        this.#drop = null
        this.#ball.visible = false
        this.#light.intensity = 0
        drop.onLand(slot)
      }
    }

    // Pegs and slots flash when touched.
    let lit = false
    if (this.#pegs) {
      const colour = new THREE.Color()
      this.#pegPulse.forEach((pulse, index) => {
        if (pulse <= 0) return
        const next = Math.max(0, pulse - dt * 4)
        this.#pegPulse[index] = next
        const centre = this.#pegCentres[index]
        const scale = 1 + next * 0.8
        this.#pegs!.setMatrixAt(index, this.#matrix.makeScale(scale, scale, 1).setPosition(centre))
        this.#pegs!.setColorAt(index, colour.setRGB(1 + next * 2, 1 + next * 1.6, 1 + next))
        lit = true
      })
      if (lit) { this.#pegs.instanceMatrix.needsUpdate = true; if (this.#pegs.instanceColor) this.#pegs.instanceColor.needsUpdate = true }
    }
    this.#slotPulse.forEach((pulse, slot) => {
      if (pulse <= 0) return
      this.#slotPulse[slot] = Math.max(0, pulse - dt * 1.4)
      const plate = this.#slotPlates[slot]
      ;(plate.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.1 + this.#slotPulse[slot] * 2.6
      plate.position.z = 0.02 + this.#slotPulse[slot] * 0.18
      lit = true
    })

    const particlesLive = this.#trail.alive() || this.#burst.alive()
    if (animating || lit || particlesLive) {
      this.#trail.update(dt, this.#stage.pixelScale)
      this.#burst.update(dt, this.#stage.pixelScale)
      this.#dirty = false
      return true
    }
    void time
    if (this.#dirty) { this.#dirty = false; return true }
    return false
  }

  dispose () {
    this.#trail.dispose()
    this.#burst.dispose()
    this.#stage.dispose()
  }
}
