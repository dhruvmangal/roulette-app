import * as THREE from 'three'
import { GOLD, Particles, createStage, goldMaterial, gradientTexture, labelTexture, type Stage } from './stage'

export const HORSE_COUNT = 6
const LANE = 1.15
const START_X = -13
const FINISH_X = 13

/** Racing silks, and the coat of each horse. */
export const SILK_HEX = [0xe8c36a, 0xc8283c, 0x3f8fe0, 0x59d39a, 0xa06be0, 0xf08a3c] as const
const COATS = [0x6b3a1e, 0x9a4a1d, 0x17171d, 0xb9b9c2, 0xd9a85a, 0x4a2a18] as const

const laneZ = (horse: number) => (horse - (HORSE_COUNT - 1) / 2) * LANE

interface Rider {
  group: THREE.Group
  legs: Array<{ upper: THREE.Object3D, lower: THREE.Object3D, phase: number }>
  body: THREE.Object3D
  tail: THREE.Object3D
  rider: THREE.Object3D
  x: number
  speed: number
  gait: number
}

/** A low-poly horse and rider, facing +X. About 1.9 units long. */
function buildHorse (horse: number): Rider {
  const group = new THREE.Group()
  const coat = new THREE.MeshStandardMaterial({ color: COATS[horse], roughness: 0.55, metalness: 0.1 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x0f0f14, roughness: 0.6 })
  const silk = new THREE.MeshStandardMaterial({ color: SILK_HEX[horse], roughness: 0.45, metalness: 0.15 })

  const body = new THREE.Group()
  group.add(body)
  const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.7, 8, 20), coat)
  barrel.rotation.z = Math.PI / 2
  barrel.scale.set(1, 1, 0.82)
  barrel.position.y = 1.0
  body.add(barrel)
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.46, 6, 14), coat)
  neck.position.set(0.72, 1.42, 0)
  neck.rotation.z = -0.62
  body.add(neck)
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.34, 6, 14), coat)
  head.position.set(1.02, 1.62, 0)
  head.rotation.z = -1.15
  body.add(head)
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 8), coat)
    ear.position.set(0.9, 1.78, side * 0.06)
    ear.rotation.z = 0.2
    body.add(ear)
  }
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.06), dark)
  mane.position.set(0.66, 1.55, 0)
  mane.rotation.z = -0.62
  body.add(mane)

  const tail = new THREE.Group()
  tail.position.set(-0.7, 1.12, 0)
  const tailMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 10), dark)
  tailMesh.position.set(-0.08, -0.28, 0)
  tailMesh.rotation.z = 0.25
  tail.add(tailMesh)
  body.add(tail)

  // Four legs, each in two parts that swing from the hip or shoulder.
  const legs: Rider['legs'] = []
  const legAt = (x: number, z: number, phase: number) => {
    const upper = new THREE.Group()
    upper.position.set(x, 0.92, z)
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.46, 10), coat)
    thigh.position.y = -0.23
    upper.add(thigh)
    const lower = new THREE.Group()
    lower.position.y = -0.46
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.46, 10), coat)
    shin.position.y = -0.23
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.07, 10), dark)
    hoof.position.y = -0.48
    lower.add(shin, hoof)
    upper.add(lower)
    group.add(upper)
    legs.push({ upper, lower, phase })
  }
  legAt(0.48, 0.12, 0)
  legAt(0.48, -0.12, 0.45)
  legAt(-0.48, 0.12, Math.PI)
  legAt(-0.48, -0.12, Math.PI + 0.45)

  // The jockey, crouched in the silks, with a saddle cloth carrying the number.
  const rider = new THREE.Group()
  rider.position.set(0.1, 1.38, 0)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.3, 6, 12), silk)
  torso.rotation.z = -1.25
  torso.position.set(0.08, 0.12, 0)
  rider.add(torso)
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 14), silk)
  helmet.position.set(0.34, 0.3, 0)
  rider.add(helmet)
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd9a98a, roughness: 0.7 }))
  face.position.set(0.43, 0.27, 0)
  rider.add(face)
  group.add(rider)
  for (const side of [-1, 1]) {
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.26),
      new THREE.MeshStandardMaterial({ map: labelTexture(String(horse + 1), { color: '#101018', font: '700 110px "JetBrains Mono", ui-monospace, monospace', width: 128, height: 128, background: `#${SILK_HEX[horse].toString(16).padStart(6, '0')}` }), roughness: 0.5 })
    )
    cloth.position.set(0.0, 1.0, side * 0.255)
    cloth.rotation.y = side === 1 ? 0 : Math.PI
    body.add(cloth)
  }
  return { group, legs, body, tail, rider, x: START_X, speed: 0, gait: horse * 0.9 }
}

function checkerTexture (): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')!
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      context.fillStyle = (row + column) % 2 ? '#f5efe2' : '#101018'
      context.fillRect(column * 8, row * 8, 8, 8)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  return texture
}

function buildStands (stage: Stage, width: number): THREE.Group {
  const group = new THREE.Group()
  const tierMaterial = new THREE.MeshStandardMaterial({ color: 0x15121c, roughness: 0.7, metalness: 0.2 })
  const crowd: number[] = []
  const colours: number[] = []
  const palette = [0xffd9a0, 0xf5efe2, 0xe8c36a, 0xc8283c, 0x59d39a, 0x7fb3ff]
  for (let tier = 0; tier < 4; tier++) {
    const height = 1.5
    const y = 0.75 + tier * 1.55
    const z = -9.5 - tier * 2.6
    const block = new THREE.Mesh(new THREE.BoxGeometry(width * 1.4, height, 2.6), tierMaterial)
    block.position.set(0, y, z)
    group.add(block)
    for (let i = 0; i < 520; i++) {
      crowd.push((Math.random() - 0.5) * width * 1.35, y + height / 2 + 0.1 + Math.random() * 0.55, z + 1.2 - Math.random() * 1.3)
      const colour = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]).multiplyScalar(0.55 + Math.random() * 0.6)
      colours.push(colour.r, colour.g, colour.b)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(crowd, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
  group.add(new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.2, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9 })))

  // A night sky wall behind, so there is never a black void above.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(width * 2, 60), new THREE.MeshBasicMaterial({ map: stage.track(gradientTexture('#05050b', '#2a1630')), fog: false }))
  wall.position.set(0, 24, -32)
  group.add(wall)

  // Floodlights with a glow, and light falling on the track.
  const glow = stage.track(glowTexture())
  for (const x of [-30, -12, 8, 26]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 13, 10), goldMaterial(0.5))
    pole.position.set(x, 6.5, -8.5)
    group.add(pole)
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.3), new THREE.MeshBasicMaterial({ color: 0xfff1cf }))
    lamp.position.set(x, 13, -8.2)
    group.add(lamp)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffe2a8, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
    halo.position.set(x, 13, -8)
    halo.scale.setScalar(9)
    group.add(halo)
  }
  return group
}

function glowTexture (): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')!
  const fill = context.createRadialGradient(64, 64, 0, 64, 64, 64)
  fill.addColorStop(0, 'rgba(255,255,255,1)')
  fill.addColorStop(0.3, 'rgba(255,255,255,0.4)')
  fill.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = fill
  context.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

/** The race: six horses in lanes under spotlights, with a camera that follows the pack. */
export class HorsesScene {
  readonly #stage: Stage
  readonly #riders: Rider[] = []
  readonly #dust = new Particles(300, 0xb99d70)
  readonly #sparks = new Particles(220, 0xffd98a, { gravity: 4 })
  readonly #spot = new THREE.SpotLight(0xffe6b0, 0, 30, 0.35, 0.6, 1.4)
  readonly #target = new THREE.Object3D()
  #racing = false
  #celebrating = -1
  #celebrationTime = 0
  #cameraX = START_X + 4
  #dirty = true
  #seen = { width: 0, height: 0 }

  constructor (container: HTMLElement) {
    const stage = createStage(container, { fov: 34, bloom: 0.3, exposure: 0.95, reflections: 0.5 })
    this.#stage = stage
    const { scene } = stage
    scene.background = stage.track(gradientTexture('#06060a', '#15101a'))
    scene.fog = new THREE.Fog(0x0c0a12, 26, 85)

    scene.add(new THREE.HemisphereLight(0xfff0d0, 0x1a1020, 0.7))
    const key = new THREE.DirectionalLight(0xfff2dc, 1.9)
    key.position.set(-6, 10, 8)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xc8283c, 0.8)
    rim.position.set(8, 3, -6)
    scene.add(rim)
    scene.add(this.#spot, this.#target)
    this.#spot.target = this.#target

    // The track: dark turf with lane lines, a start line and a finish gate in gold.
    const width = 80
    const depth = HORSE_COUNT * LANE + 3
    const turf = new THREE.Mesh(new THREE.PlaneGeometry(width * 2, depth + 30), new THREE.MeshStandardMaterial({ color: 0x143a22, roughness: 0.9, metalness: 0 }))
    turf.rotation.x = -Math.PI / 2
    turf.position.z = -14
    scene.add(turf)
    const dirt = new THREE.Mesh(new THREE.PlaneGeometry(width, HORSE_COUNT * LANE), new THREE.MeshStandardMaterial({ color: 0x3a2d22, roughness: 0.95 }))
    dirt.rotation.x = -Math.PI / 2
    dirt.position.y = 0.01
    scene.add(dirt)
    for (let line = 0; line <= HORSE_COUNT; line++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(width, 0.012, 0.035), new THREE.MeshStandardMaterial({ color: 0xb9b2a2, roughness: 0.7 }))
      stripe.position.set(0, 0.02, (line - HORSE_COUNT / 2) * LANE)
      scene.add(stripe)
    }
    const startLine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.014, HORSE_COUNT * LANE), goldMaterial(0.3))
    startLine.position.set(START_X - 0.9, 0.022, 0)
    scene.add(startLine)
    const finish = new THREE.Mesh(new THREE.PlaneGeometry(0.7, HORSE_COUNT * LANE), new THREE.MeshStandardMaterial({ map: stage.track(checkerTexture()), roughness: 0.6 }))
    finish.rotation.x = -Math.PI / 2
    finish.position.set(FINISH_X + 0.6, 0.024, 0)
    ;(finish.material as THREE.MeshStandardMaterial).map!.repeat.set(1, HORSE_COUNT)
    ;(finish.material as THREE.MeshStandardMaterial).map!.wrapS = (finish.material as THREE.MeshStandardMaterial).map!.wrapT = THREE.RepeatWrapping
    scene.add(finish)
    const gate = new THREE.Group()
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.4, 20), goldMaterial(0.22))
      post.position.set(FINISH_X + 0.6, 1.7, side * (HORSE_COUNT * LANE / 2 + 0.4))
      gate.add(post)
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, HORSE_COUNT * LANE + 1.1), goldMaterial(0.22))
    beam.position.set(FINISH_X + 0.6, 3.4, 0)
    gate.add(beam)
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(HORSE_COUNT * LANE * 0.7, 0.8), new THREE.MeshBasicMaterial({ map: stage.track(labelTexture('FINISH', { color: '#e8c36a', font: '700 96px Cinzel, "Times New Roman", serif', width: 512, height: 128 })), transparent: true }))
    banner.position.set(FINISH_X + 0.46, 3.0, 0)
    banner.rotation.y = -Math.PI / 2
    gate.add(banner)
    scene.add(gate)

    // The grandstand behind the far rail: stepped tiers, a crowd of lights, and floodlights over it.
    scene.add(buildStands(stage, width))

    // The railings.
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.07, 0.07), goldMaterial(0.35))
      rail.position.set(0, 0.9, side * (HORSE_COUNT * LANE / 2 + 0.7))
      scene.add(rail)
      for (let x = -width / 2; x <= width / 2; x += 4) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), goldMaterial(0.4))
        post.position.set(x, 0.45, side * (HORSE_COUNT * LANE / 2 + 0.7))
        scene.add(post)
      }
    }

    for (let horse = 0; horse < HORSE_COUNT; horse++) {
      const rider = buildHorse(horse)
      rider.group.position.set(START_X, 0, laneZ(horse))
      this.#riders.push(rider)
      scene.add(rider.group)
    }
    scene.add(this.#dust.points, this.#sparks.points)
    stage.run((dt, time) => this.#frame(dt, time))
  }

  /** Brings every horse back to the gate. */
  reset () {
    this.#racing = false
    this.#celebrating = -1
    this.#spot.intensity = 0
    this.#riders.forEach(rider => { rider.x = START_X; rider.speed = 0 })
    this.#dirty = true
  }

  /** How far along the track a horse is, 0 to 1. */
  setProgress (horse: number, progress: number) {
    const rider = this.#riders[horse]
    const x = START_X + (FINISH_X - START_X) * progress
    rider.speed = Math.max(0, x - rider.x)
    rider.x = x
    this.#racing = true
  }

  /** The race is over: light up the winner. */
  celebrate (horse: number) {
    this.#racing = false
    this.#celebrating = horse
    this.#celebrationTime = 0
    const rider = this.#riders[horse]
    for (let i = 0; i < 120; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 1 + Math.random() * 4
      this.#sparks.emit(rider.x, 2.2, laneZ(horse), Math.cos(angle) * speed, 2 + Math.random() * 3, Math.sin(angle) * speed, 1 + Math.random(), 0.25 + Math.random() * 0.3)
    }
  }

  #frame (dt: number, time: number): boolean {
    const resized = this.#seen.width !== this.#stage.width || this.#seen.height !== this.#stage.height
    this.#seen = { width: this.#stage.width, height: this.#stage.height }
    let moving = this.#racing || this.#celebrating >= 0 || resized || this.#dirty
    this.#dirty = false

    const leader = Math.max(...this.#riders.map(rider => rider.x))
    const trailing = Math.min(...this.#riders.map(rider => rider.x))
    const wanted = this.#racing || this.#celebrating >= 0 ? Math.min(FINISH_X - 3, (leader + trailing) / 2 + 1.5) : START_X + (this.#stage.width / this.#stage.height < 1.25 ? 0.8 : 4)
    const follow = 1 - Math.pow(0.002, dt)
    if (Math.abs(wanted - this.#cameraX) > 0.002) moving = true
    this.#cameraX += (wanted - this.#cameraX) * follow
    const { camera } = this.#stage
    const wide = this.#stage.width / this.#stage.height < 1.25
    camera.position.set(this.#cameraX - 0.5, wide ? 8.6 : 8.4, wide ? 18 : 14)
    camera.lookAt(this.#cameraX + 0.5, wide ? 0.3 : 0.9, wide ? 0 : 0)

    for (const [horse, rider] of this.#riders.entries()) {
      rider.group.position.x = rider.x
      const pace = Math.min(1, rider.speed / (dt * 9 || 1))
      const gallop = this.#racing ? 1 : 0
      rider.gait += dt * (7 + pace * 6) * gallop
      for (const leg of rider.legs) {
        const swing = Math.sin(rider.gait + leg.phase)
        leg.upper.rotation.z = swing * 0.85 * gallop
        leg.lower.rotation.z = -Math.max(0, Math.sin(rider.gait + leg.phase + 1.2)) * 1.25 * gallop
      }
      rider.body.position.y = Math.abs(Math.sin(rider.gait)) * 0.08 * gallop
      rider.body.rotation.z = Math.sin(rider.gait) * 0.025 * gallop
      rider.tail.rotation.z = Math.sin(rider.gait * 0.5 + 1) * 0.25 * gallop + 0.35 * gallop
      rider.rider.position.y = 1.38 + Math.abs(Math.sin(rider.gait)) * 0.06 * gallop
      if (this.#racing && rider.speed > 0 && Math.random() < 0.7) {
        this.#dust.emit(rider.x - 0.7, 0.1, laneZ(horse) + (Math.random() - 0.5) * 0.3, -1 - Math.random() * 2, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.5, 0.25 + Math.random() * 0.3)
      }
      rider.speed = 0
    }

    if (this.#celebrating >= 0) {
      this.#celebrationTime += dt
      const winner = this.#riders[this.#celebrating]
      this.#spot.position.set(winner.x - 2, 9, laneZ(this.#celebrating) + 4)
      this.#target.position.set(winner.x, 1, laneZ(this.#celebrating))
      this.#spot.intensity = Math.min(1, this.#celebrationTime * 2) * 180
      winner.group.position.y = Math.abs(Math.sin(this.#celebrationTime * 5)) * 0.12
      moving = true
    }

    const particles = this.#dust.alive() || this.#sparks.alive()
    this.#dust.update(dt, this.#stage.pixelScale)
    this.#sparks.update(dt, this.#stage.pixelScale)
    void time
    return moving || particles
  }

  dispose () {
    this.#dust.dispose()
    this.#sparks.dispose()
    this.#stage.dispose()
    void GOLD
  }
}
