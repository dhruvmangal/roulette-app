import * as THREE from 'three'
import { CRASH_RATE } from '@roulette/engine'
import { GOLD, Particles, createStage, goldMaterial, gradientTexture, type Stage } from './stage'

export interface FlightState {
  /** Milliseconds into the flight; 0 while waiting for take-off. */
  elapsedMs: number
  /** Flight milliseconds at which it ended, once it has. */
  crashedAtMs: number | null
  /** Real milliseconds since the end was shown. */
  sinceCrashMs: number
}

const SAMPLES = 140
const TUBE_SIDES = 6
const X0 = -7
const X_SPAN = 14
const Y0 = 0.55
const Y_SPAN = 7

const multiplierOf = (ms: number) => Math.exp(CRASH_RATE * ms)

const crimson = () => new THREE.MeshStandardMaterial({ color: 0xc8283c, metalness: 0.5, roughness: 0.3 })
const cream = () => new THREE.MeshStandardMaterial({ color: 0xf5efe2, metalness: 0.55, roughness: 0.28 })

/** A propeller plane pointing along +X, about 2 units long. */
function buildPlane () {
  const group = new THREE.Group()
  const model = new THREE.Group()
  group.add(model)

  const body = new THREE.Group()
  body.rotation.z = -Math.PI / 2
  const profile = [[0.001, -0.95], [0.08, -0.9], [0.2, -0.55], [0.26, -0.1], [0.26, 0.3], [0.22, 0.6], [0.16, 0.78]].map(([r, y]) => new THREE.Vector2(r, y))
  body.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 32), cream()))
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.245, 0.3, 32), crimson())
  cowl.position.y = 0.85
  body.add(cowl)
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.262, 0.262, 0.12, 32, 1, true), crimson())
  stripe.position.y = -0.3
  body.add(stripe)
  model.add(body)

  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 2.5), cream())
  wing.position.set(0.1, -0.02, 0)
  model.add(wing)
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.065, 0.22), crimson())
    tip.position.set(0.1, -0.02, side * 1.24)
    model.add(tip)
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), goldMaterial(0.35))
    strut.position.set(0.15, -0.17, side * 0.55)
    strut.rotation.x = side * 0.25
    model.add(strut)
  }
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.05), crimson())
  fin.position.set(-0.85, 0.3, 0)
  fin.rotation.z = -0.35
  model.add(fin)
  const stabiliser = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 1.0), cream())
  stabiliser.position.set(-0.85, 0.05, 0)
  model.add(stabiliser)

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshStandardMaterial({ color: 0x1b4f8f, emissive: 0x2a6fd0, emissiveIntensity: 0.5, metalness: 0.2, roughness: 0.05 }))
  canopy.position.set(0.15, 0.22, 0)
  canopy.scale.set(1.5, 0.8, 0.9)
  model.add(canopy)

  const propeller = new THREE.Group()
  propeller.position.x = 1.02
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.95, 0.09), noirBlade())
    blade.rotation.x = i * Math.PI / 2
    propeller.add(blade)
  }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), goldMaterial(0.2))
  propeller.add(hub)
  const blur = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshBasicMaterial({ color: 0xf5efe2, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }))
  blur.rotation.y = Math.PI / 2
  model.add(blur)
  blur.position.x = 1.02
  model.add(propeller)
  group.scale.setScalar(0.85)
  return { group, model, propeller }
}

const noirBlade = () => new THREE.MeshStandardMaterial({ color: 0x1c1c26, metalness: 0.6, roughness: 0.4 })

/**
 * The flight of Aviator in 3D: a propeller plane riding the tip of a glowing path over a dusk sky,
 * with a sun on the horizon, layers of cloud and a contrail. The picture is a function of the
 * flight state it is given every frame; it keeps no game logic.
 */
export class FlightScene {
  readonly #stage: Stage
  readonly #plane = buildPlane()
  readonly #tubePositions = new Float32Array((SAMPLES + 1) * TUBE_SIDES * 3)
  readonly #tube: THREE.Mesh
  readonly #curtainPositions = new Float32Array((SAMPLES + 1) * 2 * 3)
  readonly #curtain: THREE.Mesh
  readonly #contrail = new Particles(300, 0xffe9e0, { blending: THREE.NormalBlending, opacity: 0.5 })
  readonly #stars: THREE.Points
  readonly #clouds: Array<{ sprite: THREE.Sprite, speed: number }> = []
  readonly #tip = new THREE.Vector3()

  constructor (container: HTMLElement) {
    const stage = createStage(container, { fov: 36, bloom: 0.5, exposure: 1.0, reflections: 0.7 })
    this.#stage = stage
    const { scene, camera } = stage
    scene.background = new THREE.Color(0x07070f)
    // The sky is a wall far behind, so its warm band sits on the horizon wherever the camera looks.
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(320, 90), new THREE.MeshBasicMaterial({ map: stage.track(skyTexture()), fog: false, depthWrite: false }))
    sky.position.set(0, 36, -75)
    scene.add(sky)
    scene.fog = new THREE.Fog(0x3a1a26, 26, 80)
    camera.position.set(3.2, 5.4, 15.5)
    camera.lookAt(0, 4.1, 0)

    scene.add(new THREE.HemisphereLight(0xffe2c0, 0x1a1020, 0.8))
    const key = new THREE.DirectionalLight(0xffe2c0, 2.4)
    key.position.set(-7, 5, 6)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xff4f66, 1.4)
    rim.position.set(7, 3, -6)
    scene.add(rim)

    // The sun low on the horizon, far behind.
    const sunTexture = stage.track(glowMap())
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture, color: 0xff9a5c, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
    sun.position.set(9, 3.2, -40)
    sun.scale.setScalar(46)
    scene.add(sun)
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture, color: 0xffe2b0, transparent: true, opacity: 0.95, depthWrite: false, fog: false }))
    core.position.set(9, 3.4, -39)
    core.scale.setScalar(9)
    scene.add(core)

    // The ground far below: a dark glossy plane with a gold grid fading into the haze.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 90), new THREE.MeshStandardMaterial({ color: 0x07060b, metalness: 0.9, roughness: 0.22 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, -0.02, -22)
    scene.add(floor)
    const grid = new THREE.GridHelper(120, 80, GOLD, GOLD)
    grid.position.set(0, 0, -22)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.14
    scene.add(grid)

    // The flight path: a glowing tube and a curtain down to the ground.
    const tubeGeometry = new THREE.BufferGeometry()
    tubeGeometry.setAttribute('position', new THREE.BufferAttribute(this.#tubePositions, 3))
    const indices: number[] = []
    for (let i = 0; i < SAMPLES; i++) {
      for (let j = 0; j < TUBE_SIDES; j++) {
        const a = i * TUBE_SIDES + j
        const b = i * TUBE_SIDES + ((j + 1) % TUBE_SIDES)
        indices.push(a, b, a + TUBE_SIDES, b, b + TUBE_SIDES, a + TUBE_SIDES)
      }
    }
    tubeGeometry.setIndex(indices)
    this.#tube = new THREE.Mesh(tubeGeometry, new THREE.MeshBasicMaterial({ color: 0xff6a7c }))
    this.#tube.frustumCulled = false
    scene.add(this.#tube)

    const curtainGeometry = new THREE.BufferGeometry()
    curtainGeometry.setAttribute('position', new THREE.BufferAttribute(this.#curtainPositions, 3))
    const colours = new Float32Array((SAMPLES + 1) * 2 * 4)
    for (let i = 0; i <= SAMPLES; i++) colours.set([1, 0.28, 0.36, 0.05 + 0.1 * (i / SAMPLES), 1, 0.28, 0.36, 0], i * 8)
    curtainGeometry.setAttribute('color', new THREE.BufferAttribute(colours, 4))
    const curtainIndices: number[] = []
    for (let i = 0; i < SAMPLES; i++) curtainIndices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    curtainGeometry.setIndex(curtainIndices)
    this.#curtain = new THREE.Mesh(curtainGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false }))
    this.#curtain.frustumCulled = false
    scene.add(this.#curtain)

    // A few stars high up, and three layers of cloud drifting past at different speeds.
    const starPositions = new Float32Array(260 * 3)
    for (let i = 0; i < 260; i++) starPositions.set([(Math.random() - 0.5) * 90, 8 + Math.random() * 22, -30 - Math.random() * 20], i * 3)
    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    this.#stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xfff0d0, size: 0.1, sizeAttenuation: true, transparent: true, opacity: 0.7, fog: false }))
    scene.add(this.#stars)

    const cloudTexture = stage.track(cloudMap())
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 8; i++) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: cloudTexture, color: layer === 0 ? 0xffb8a0 : layer === 1 ? 0xf5d8d0 : 0xe8c8d0, transparent: true,
          opacity: 0.16 + layer * 0.05 + Math.random() * 0.1, depthWrite: false, fog: false
        }))
        const z = -6 - layer * 9 - Math.random() * 5
        sprite.position.set((Math.random() - 0.5) * 70, 0.8 + Math.random() * (9 + layer * 3), z)
        const size = 1.2 + layer * 0.7 + Math.random() * 1.4
        sprite.scale.set(size * 2.2, size * 0.7, 1)
        this.#clouds.push({ sprite, speed: 0.5 + (2 - layer) * 0.45 })
        scene.add(sprite)
      }
    }

    scene.add(this.#contrail.points, this.#plane.group)
    stage.run((dt, time) => this.#frame(dt, time))
  }

  update (state: FlightState) {
    this.#state = state
  }

  #state: FlightState = { elapsedMs: 0, crashedAtMs: null, sinceCrashMs: 0 }

  #frame (dt: number, time: number) {
    const { elapsedMs, crashedAtMs, sinceCrashMs } = this.#state
    const drawnMs = crashedAtMs ?? elapsedMs
    const xMax = Math.max(8000, drawnMs * 1.12)
    const yMax = Math.max(2, multiplierOf(drawnMs) * 1.15)
    const X = (ms: number) => X0 + (ms / xMax) * X_SPAN
    const Y = (m: number) => Y0 + ((m - 1) / (yMax - 1)) * Y_SPAN
    const idle = elapsedMs <= 0 && crashedAtMs === null
    const crashed = crashedAtMs !== null

    this.#rebuildPath(X, Y, drawnMs, idle, crashed)

    const tipX = X(drawnMs)
    const tipY = Y(multiplierOf(drawnMs))
    const slope = 14 / xMax
    const rise = (Y_SPAN * CRASH_RATE * multiplierOf(drawnMs)) / (yMax - 1)
    const heading = idle ? 0.35 : Math.atan2(rise, slope)
    this.#tip.set(idle ? X0 + 0.7 : tipX, idle ? Y0 + 0.6 + Math.sin(time * 2.2) * 0.07 : tipY, 0)

    const plane = this.#plane.group
    plane.position.copy(this.#tip)
    plane.scale.setScalar(1.2)
    plane.visible = true
    plane.rotation.set(idle ? 0.1 : 0.34 + Math.sin(time * 1.7) * 0.06, 0, heading)
    this.#plane.propeller.rotation.x = time * 70

    // The contrail, from the tail.
    if (!crashed && !idle) {
      const back = new THREE.Vector3(-Math.cos(heading), -Math.sin(heading), 0)
      for (let i = 0; i < 1; i++) {
        this.#contrail.emit(
          this.#tip.x + back.x * 1.1, this.#tip.y + back.y * 1.1, (Math.random() - 0.5) * 0.2,
          back.x * 0.3 + (Math.random() - 0.5) * 0.15, back.y * 0.3 + (Math.random() - 0.5) * 0.15, 0,
          1.1 + Math.random() * 0.6, 0.16 + Math.random() * 0.14
        )
      }
    }

    // After the end the plane carries on, up and away.
    if (crashed) {
      const seconds = sinceCrashMs / 1000
      const fly = Math.min(1, seconds / 1.1)
      const away = fly * fly * 14
      plane.position.set(tipX + Math.cos(heading) * away, tipY + Math.sin(heading) * away + fly * 3, -fly * 10)
      plane.rotation.set(0.34 + fly * 3.2, 0, heading + fly * 0.5)
      plane.scale.setScalar(1.2 * (1 - fly * 0.7))
      plane.visible = fly < 1
    }

    // Clouds drift past, the faster the further the flight has gone; the camera sways a little.
    const drift = dt * (idle ? 0.5 : 1.4 + Math.min(3, drawnMs / 6000))
    for (const { sprite, speed } of this.#clouds) {
      sprite.position.x -= drift * speed
      if (sprite.position.x < -38) sprite.position.x = 38
    }
    const stars = this.#stars.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < stars.count; i++) {
      let x = stars.getX(i) - drift * 0.15
      if (x < -45) x += 90
      stars.setX(i, x)
    }
    stars.needsUpdate = true

    this.#contrail.update(dt, this.#stage.pixelScale)
    const { camera } = this.#stage
    // A narrow screen steps back so the whole flight stays in view.
    const back = Math.min(1.9, Math.max(1, 1.5 / camera.aspect))
    camera.position.set(3.2 + Math.sin(time * 0.35) * 0.9, 5.4 * Math.min(1.35, back) + Math.sin(time * 0.5) * 0.25, 15.5 * back)
    camera.lookAt(0, 4.1, 0)
  }

  #rebuildPath (X: (ms: number) => number, Y: (m: number) => number, drawnMs: number, idle: boolean, crashed: boolean) {
    ;(this.#tube.material as THREE.MeshBasicMaterial).color.set(crashed ? 0xff5468 : 0xff7a5c)
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= SAMPLES; i++) {
      const ms = idle ? 0 : (drawnMs * i) / SAMPLES
      points.push(new THREE.Vector3(X(ms), Y(multiplierOf(ms)), 0))
    }
    const radius = 0.07
    const normal = new THREE.Vector3()
    for (let i = 0; i <= SAMPLES; i++) {
      const next = points[Math.min(SAMPLES, i + 1)]
      const previous = points[Math.max(0, i - 1)]
      const tx = next.x - previous.x
      const ty = next.y - previous.y
      const length = Math.hypot(tx, ty) || 1
      normal.set(-ty / length, tx / length, 0)
      const taper = idle ? 0 : 0.35 + 0.65 * (i / SAMPLES)
      for (let j = 0; j < TUBE_SIDES; j++) {
        const angle = (j / TUBE_SIDES) * Math.PI * 2
        const o = (i * TUBE_SIDES + j) * 3
        this.#tubePositions[o] = points[i].x + Math.cos(angle) * normal.x * radius * taper
        this.#tubePositions[o + 1] = points[i].y + Math.cos(angle) * normal.y * radius * taper
        this.#tubePositions[o + 2] = Math.sin(angle) * radius * taper
      }
      this.#curtainPositions.set([points[i].x, points[i].y, 0, points[i].x, 0, 0], i * 6)
    }
    this.#tube.geometry.attributes.position.needsUpdate = true
    this.#curtain.geometry.attributes.position.needsUpdate = true
    this.#curtain.visible = !idle
  }

  dispose () {
    this.#contrail.dispose()
    this.#stage.dispose()
  }
}

/** The dusk sky behind everything: deep violet overhead, wine, then a warm band at the horizon. */
function skyTexture (): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 512
  const context = canvas.getContext('2d')!
  const fill = context.createLinearGradient(0, 0, 0, 512)
  fill.addColorStop(0, '#07070f')
  fill.addColorStop(0.45, '#1b0f24')
  fill.addColorStop(0.72, '#4a1a2c')
  fill.addColorStop(0.86, '#a8432e')
  fill.addColorStop(1, '#e8a15a')
  context.fillStyle = fill
  context.fillRect(0, 0, 4, 512)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function glowMap (): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')!
  const fill = context.createRadialGradient(64, 64, 0, 64, 64, 64)
  fill.addColorStop(0, 'rgba(255,255,255,1)')
  fill.addColorStop(0.25, 'rgba(255,255,255,0.35)')
  fill.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = fill
  context.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

/** A cloud: a cluster of soft puffs, flatter underneath. */
function cloudMap (): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 96
  const context = canvas.getContext('2d')!
  const puffs: Array<[number, number, number]> = [[70, 58, 34], [112, 44, 40], [158, 50, 38], [196, 62, 30], [128, 64, 46], [92, 66, 30], [170, 68, 32]]
  for (const [x, y, r] of puffs) {
    const fill = context.createRadialGradient(x, y, 0, x, y, r)
    fill.addColorStop(0, 'rgba(255,255,255,0.8)')
    fill.addColorStop(0.6, 'rgba(255,255,255,0.35)')
    fill.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = fill
    context.beginPath()
    context.arc(x, y, r, 0, Math.PI * 2)
    context.fill()
  }
  return new THREE.CanvasTexture(canvas)
}
