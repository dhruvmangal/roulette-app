import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { VARIANTS, pocketColor, wheelIndex, type Pocket, type VariantName } from '@roulette/engine'
import { RouletteSound } from './rouletteSound'
import { DealerRig } from './dealer/DealerRig'
import { ProceduralDealer } from './dealer/ProceduralDealer'
import { StaticDealer } from './dealer/StaticDealer'
import { VrmDealer } from './dealer/VrmDealer'
import { DEALERS, type Dealer, type DealerKind, type Gesture } from './dealer/types'

export interface SpinRequest { id: number, pocket: Pocket }
export type TableView = 'wheel' | 'dealer'
/** A line for the dealer to say; a new id makes her say it. */
export interface Announcement { id: number, text: string, gesture?: Gesture }

interface Props {
  variant: VariantName
  spin?: SpinRequest | null
  onSettled?: (id: number) => void
  /** Pocket the ball rests in when idle (e.g. the last result). */
  restingPocket?: Pocket | null
  compact?: boolean
  view?: TableView
  dealer?: DealerKind
  announcement?: Announcement | null
  muted?: boolean
  /** False hands touches to the page (e.g. to swipe between views) instead of turning the camera. */
  interactive?: boolean
}

// Geometry, in rotor radii. Pocket angles are measured counter-clockwise seen from above,
// and wheel order runs clockwise, so pocket i of wheelOrder sits at local angle -i * slice.
/** The shortest gap between drawn frames while the wheel only idles (about 30 a second). */
const IDLE_FRAME_MS = 30
const NUMBER_IN = 0.8
const POCKET_IN = 0.6
const POCKET_R = 0.7
const TRACK_R = 1.3
const BALL_R = 0.032
/** Long enough to build suspense: most of it is the ball circling the track. */
const SPIN_SECONDS = 13
/** Phases as fractions of the spin: launch onto the track, drop toward the rotor, bounce, settle. */
const LAUNCH = 0.7 / SPIN_SECONDS
const DROP = 0.68
const BALL_LAPS = 9
const IDLE_SPEED = 0.3
const BOUNCE = { start: 0.79, end: 0.94, hops: 5 }
const FIT_RADIUS = 1.58

// Dealer stage, in rotor radii (1 unit ≈ 25 cm): table top at the wheel's base, croupier behind it.
const TABLE_TOP = -0.13
const FLOOR_Y = TABLE_TOP - 3.6
const DEALER_Z = -2.85
const DEALER_TARGET = new THREE.Vector3(0, 0.95, -0.7)
const DEALER_CAMERA = new THREE.Vector3(0, 4.7, 9.4)

/** Ball travel: decelerates like rolling friction but keeps some speed into the pockets. */
const easeOutBall = (t: number) => 1 - (1 - t) ** 2.4
const easeOutQuad = (t: number) => 1 - (1 - t) ** 2
const smooth = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const TAU = Math.PI * 2

/** Height of the playing surface at a radius, so the ball follows the bowl and rotor. */
function surfaceY (r: number) {
  const points: [number, number][] = [[0, 0], [POCKET_IN, 0], [NUMBER_IN, 0.035], [1.0, 0.035], [1.02, 0.02], [1.18, 0.12], [1.3, 0.2], [1.4, 0.2]]
  for (let i = 1; i < points.length; i++) {
    const [r0, y0] = points[i - 1]
    const [r1, y1] = points[i]
    if (r <= r1) return lerp(y0, y1, (r - r0) / (r1 - r0))
  }
  return 0.2
}

const POCKET_COLORS = { red: '#a3172b', black: '#121218', green: '#0a7047' }
const POCKET_COLORS_DEEP = { red: '#6e0e1c', black: '#08080c', green: '#05452b' }

function drawRotorFace (canvas: HTMLCanvasElement, order: readonly Pocket[]) {
  const ctx = canvas.getContext('2d')!
  const size = canvas.width
  const c = size / 2
  const scale = c
  const slice = TAU / order.length
  ctx.clearRect(0, 0, size, size)

  const wedge = (inner: number, outer: number, a0: number, a1: number, fill: string) => {
    ctx.beginPath()
    ctx.arc(c, c, outer * scale, a0, a1)
    ctx.arc(c, c, inner * scale, a1, a0, true)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
  }

  order.forEach((pocket, i) => {
    // Canvas angles run clockwise on screen, matching the wheel order seen from above.
    const a0 = i * slice - slice / 2
    const a1 = a0 + slice
    const color = pocketColor(pocket)
    wedge(NUMBER_IN, 1, a0, a1, POCKET_COLORS[color])
    wedge(POCKET_IN, NUMBER_IN, a0, a1, POCKET_COLORS_DEEP[color])

    ctx.save()
    ctx.translate(c, c)
    ctx.rotate(i * slice)
    ctx.translate(0.9 * scale, 0)
    ctx.rotate(Math.PI / 2)
    ctx.fillStyle = '#f6ecd2'
    ctx.font = `600 ${Math.round(size * 0.04)}px Cinzel, Georgia, serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(pocket, 0, 0)
    ctx.restore()

    ctx.strokeStyle = '#d9b45a'
    ctx.lineWidth = size * 0.002
    ctx.beginPath()
    ctx.moveTo(c + Math.cos(a0) * NUMBER_IN * scale, c + Math.sin(a0) * NUMBER_IN * scale)
    ctx.lineTo(c + Math.cos(a0) * scale, c + Math.sin(a0) * scale)
    ctx.stroke()
  })

  ctx.strokeStyle = '#e2bf68'
  for (const [radius, width] of [[0.995, 0.006], [NUMBER_IN, 0.004], [POCKET_IN, 0.004]]) {
    ctx.lineWidth = size * width
    ctx.beginPath()
    ctx.arc(c, c, radius * scale, 0, TAU)
    ctx.stroke()
  }
}

/** Flat ring in the XZ plane whose UVs map the shared top-down rotor texture. */
function ringGeometry (inner: number, outer: number) {
  const geometry = new THREE.RingGeometry(inner, outer, 256, 1)
  const position = geometry.attributes.position
  const uv = geometry.attributes.uv
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / 2 + 0.5, position.getY(i) / 2 + 0.5)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

function lathe (points: [number, number][], segments = 192) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments)
}

function buildWheel (variant: VariantName, maxAnisotropy: number) {
  const order = VARIANTS[variant].wheelOrder
  const slice = TAU / order.length
  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(item: T) => { disposables.push(item); return item }

  const gold = track(new THREE.MeshStandardMaterial({ color: '#d8ae52', metalness: 1, roughness: 0.22 }))
  const darkWood = track(new THREE.MeshPhysicalMaterial({ color: '#1e0b06', roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3, side: THREE.DoubleSide }))
  const warmWood = track(new THREE.MeshPhysicalMaterial({ color: '#3b1a0c', roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.25, side: THREE.DoubleSide }))
  const trackWood = track(new THREE.MeshPhysicalMaterial({ color: '#4a2410', roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.22, side: THREE.DoubleSide }))

  const wheel = new THREE.Group()

  // Static bowl: base, outer rim, ball track and the sloped apron down to the rotor.
  const bowl = new THREE.Mesh(track(lathe([[1.02, -0.13], [1.5, -0.13], [1.58, -0.04], [1.58, 0.26], [1.54, 0.32], [1.41, 0.32], [1.37, 0.3], [1.36, 0.2]])), darkWood)
  const apron = new THREE.Mesh(track(lathe([[1.36, 0.2], [1.3, 0.2], [1.18, 0.12], [1.02, 0.02], [1.005, -0.06]])), trackWood)
  const trim = new THREE.Mesh(track(new THREE.TorusGeometry(1.395, 0.012, 12, 192)), gold)
  trim.rotation.x = Math.PI / 2
  trim.position.y = 0.322
  wheel.add(bowl, apron, trim)

  const diamond = track(new THREE.OctahedronGeometry(0.045, 0))
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * TAU + slice / 3
    const marker = new THREE.Mesh(diamond, gold)
    marker.scale.set(i % 2 ? 0.55 : 1.4, 0.35, 0.55)
    marker.position.set(Math.cos(angle) * 1.17, surfaceY(1.17) + 0.012, -Math.sin(angle) * 1.17)
    marker.rotation.y = angle
    wheel.add(marker)
  }

  // Rotor: textured number and pocket rings, frets, cone and turret.
  const rotor = new THREE.Group()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 2048
  drawRotorFace(canvas, order)
  const texture = track(new THREE.CanvasTexture(canvas))
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = maxAnisotropy
  void document.fonts?.load('600 80px Cinzel').then(() => { drawRotorFace(canvas, order); texture.needsUpdate = true })
  const face = track(new THREE.MeshPhysicalMaterial({ map: texture, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }))

  const numberRing = new THREE.Mesh(track(ringGeometry(NUMBER_IN, 1)), face)
  numberRing.position.y = 0.035
  const pocketRing = new THREE.Mesh(track(ringGeometry(POCKET_IN, NUMBER_IN)), face)
  pocketRing.receiveShadow = true
  const outerWall = new THREE.Mesh(track(new THREE.CylinderGeometry(1, 1, 0.1, 256, 1, true)), warmWood)
  outerWall.position.y = -0.015
  const pocketWall = new THREE.Mesh(track(new THREE.CylinderGeometry(NUMBER_IN, NUMBER_IN, 0.035, 256, 1, true)), gold)
  pocketWall.position.y = 0.0175
  rotor.add(numberRing, pocketRing, outerWall, pocketWall)

  const fret = track(new THREE.BoxGeometry(NUMBER_IN - POCKET_IN, 0.03, 0.007))
  for (let i = 0; i < order.length; i++) {
    const angle = -(i * slice - slice / 2)
    const mesh = new THREE.Mesh(fret, gold)
    mesh.position.set(Math.cos(angle) * POCKET_R, 0.015, -Math.sin(angle) * POCKET_R)
    mesh.rotation.y = angle
    mesh.castShadow = true
    rotor.add(mesh)
  }

  const cone = new THREE.Mesh(track(lathe([[POCKET_IN, 0], [0.52, 0.05], [0.34, 0.12], [0.16, 0.17], [0, 0.18]])), warmWood)
  const coneRing = new THREE.Mesh(track(new THREE.TorusGeometry(POCKET_IN, 0.01, 10, 192)), gold)
  coneRing.rotation.x = Math.PI / 2
  coneRing.position.y = 0.008
  rotor.add(cone, coneRing)

  const turret = new THREE.Group()
  const spindle = new THREE.Mesh(track(new THREE.CylinderGeometry(0.03, 0.06, 0.26, 32)), gold)
  spindle.position.y = 0.3
  const knob = new THREE.Mesh(track(new THREE.SphereGeometry(0.05, 32, 16)), gold)
  knob.position.y = 0.45
  turret.add(spindle, knob)
  const arm = track(new THREE.CylinderGeometry(0.011, 0.011, 0.34, 12))
  const armEnd = track(new THREE.SphereGeometry(0.026, 20, 12))
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * TAU
    const mesh = new THREE.Mesh(arm, gold)
    mesh.rotation.z = Math.PI / 2
    mesh.position.set(Math.cos(angle) * 0.17, 0.33, -Math.sin(angle) * 0.17)
    mesh.rotation.y = angle
    const end = new THREE.Mesh(armEnd, gold)
    end.position.set(Math.cos(angle) * 0.34, 0.33, -Math.sin(angle) * 0.34)
    turret.add(mesh, end)
  }
  turret.traverse(object => { object.castShadow = true })
  rotor.add(turret)
  wheel.add(rotor)

  // Glow that marks the winning pocket after the ball lands.
  const glow = new THREE.PointLight('#ffd27a', 0, 0.6, 1.6)
  rotor.add(glow)

  const ball = new THREE.Mesh(
    track(new THREE.SphereGeometry(BALL_R, 32, 16)),
    track(new THREE.MeshPhysicalMaterial({ color: '#f7f5ef', roughness: 0.12, clearcoat: 1 }))
  )
  ball.castShadow = true

  const pocketAngle = (pocket: Pocket) => -wheelIndex(variant, pocket) * slice

  return { wheel, rotor, ball, glow, pocketAngle, dispose: () => disposables.forEach(item => item.dispose()) }
}

interface SpinState {
  id: number
  startedAt: number
  theta0: number
  rotorTurn: number
  rel0: number
  relTravel: number
  r0: number
  target: number
  pocket: Pocket
}

interface WheelApi {
  startSpin: (request: SpinRequest) => void
  resetView: () => void
  setView: (view: TableView) => void
  setDealer: (kind: DealerKind) => void
  announce: (announcement: Announcement) => void
}

export function Wheel3D ({ variant, spin, onSettled, restingPocket, compact, view = 'wheel', dealer = 'noir', announcement, muted = false, interactive = true }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<WheelApi | null>(null)
  const [dealerStatus, setDealerStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [caption, setCaption] = useState<string | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const dealerRef = useRef(dealer)
  dealerRef.current = dealer
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive
  const controlsRef = useRef<TrackballControls | null>(null)
  /** A spin that has started but not landed; replayed if the scene is rebuilt mid-spin. */
  const pendingSpinRef = useRef<SpinRequest | null>(null)
  const onSettledRef = useRef(onSettled)
  onSettledRef.current = onSettled
  const restingRef = useRef(restingPocket)
  restingRef.current = restingPocket

  useEffect(() => {
    const mount = mountRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 0.95
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = environment
    scene.environmentIntensity = 0.35

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)
    const viewDirection = new THREE.Vector3(0, 1.15, 1.25).normalize()

    scene.add(new THREE.HemisphereLight('#fff2dc', '#1a0f14', 0.5))
    const key = new THREE.SpotLight('#fff1d6', 30, 12, Math.PI / 5, 0.55, 1.4)
    key.position.set(0.8, 4.2, 1.6)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.bias = -0.0004
    key.shadow.radius = 4
    const rim = new THREE.DirectionalLight('#9fb4ff', 0.6)
    rim.position.set(-3, 1.5, -2.5)
    scene.add(key, rim)

    const shadowCatcher = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.ShadowMaterial({ opacity: 0.4 }))
    shadowCatcher.rotation.x = -Math.PI / 2
    shadowCatcher.position.y = -0.135
    shadowCatcher.receiveShadow = true
    scene.add(shadowCatcher)

    const parts = buildWheel(variant, renderer.capabilities.getMaxAnisotropy())
    const { wheel, rotor, ball, glow, pocketAngle } = parts
    wheel.traverse(object => { if ((object as THREE.Mesh).isMesh) object.receiveShadow = true })
    scene.add(wheel)

    // The ball rests in a pocket (as a child of the rotor) until a spin launches it.
    const restIn = (pocket: Pocket) => {
      const angle = pocketAngle(pocket)
      rotor.add(ball)
      ball.position.set(Math.cos(angle) * POCKET_R, BALL_R + 0.004, -Math.sin(angle) * POCKET_R)
      return angle
    }
    let ballAngle = restIn(restingRef.current ?? VARIANTS[variant].wheelOrder[0])

    const controls = new TrackballControls(camera, renderer.domElement)
    controls.rotateSpeed = 1.8
    controls.zoomSpeed = 0.9
    controls.noPan = true
    controls.dynamicDampingFactor = 0.12
    controls.minDistance = 2.6
    controls.maxDistance = 12
    controls.enabled = interactiveRef.current
    controlsRef.current = controls

    // Frame the wheel as seen from the default angle: project its outline and back the camera off until it fits.
    let fitted = 0
    const outline: THREE.Vector3[] = [new THREE.Vector3(0, 0.5, 0)]
    for (let i = 0; i < 48; i++) {
      const angle = (i / 48) * TAU
      for (const y of [-0.13, 0.32]) outline.push(new THREE.Vector3(Math.cos(angle) * FIT_RADIUS, y, -Math.sin(angle) * FIT_RADIUS))
    }
    const fitDistance = () => {
      const probe = camera.clone()
      const point = new THREE.Vector3()
      let distance = 6
      for (let pass = 0; pass < 5; pass++) {
        probe.position.copy(viewDirection).multiplyScalar(distance)
        probe.up.set(0, 1, 0)
        probe.lookAt(0, 0.05, 0)
        probe.updateMatrixWorld()
        let extent = 0
        for (const corner of outline) {
          point.copy(corner).project(probe)
          extent = Math.max(extent, Math.abs(point.x), Math.abs(point.y))
        }
        distance *= extent / (compact ? 0.96 : 0.92)
      }
      return distance
    }
    let currentView: TableView = compact ? 'wheel' : viewRef.current
    const resetView = () => {
      controls.reset()
      camera.up.set(0, 1, 0)
      if (currentView === 'dealer') {
        // Pull back on narrow screens so the wheel and the croupier both stay in frame.
        const scale = Math.max(1, 1.1 / camera.aspect)
        camera.position.copy(DEALER_CAMERA).sub(DEALER_TARGET).multiplyScalar(scale).add(DEALER_TARGET)
        controls.target.copy(DEALER_TARGET)
        fitted = camera.position.distanceTo(DEALER_TARGET)
      } else {
        camera.position.copy(viewDirection).multiplyScalar(fitted = fitDistance())
        controls.target.set(0, 0.05, 0)
      }
      camera.lookAt(controls.target)
      controls.update()
    }

    // Dealer stage: felt table, the croupier and a soft face light. Built the first time it is shown.
    const stage = new THREE.Group()
    stage.visible = false
    scene.add(stage)
    const stageDisposables: { dispose: () => void }[] = []
    let rig: Dealer | null = null
    let rigKind: DealerKind | null = null
    let loadToken = 0
    let disposed = false
    const buildStage = () => {
      if (stage.children.length) return
      const felt = new THREE.MeshStandardMaterial({ color: '#0e2f57', roughness: 0.92 })
      const wood = new THREE.MeshPhysicalMaterial({ color: '#2a1209', roughness: 0.4, clearcoat: 0.8 })
      const tableGeometry = new THREE.BoxGeometry(12, 0.3, 5.6)
      const railGeometry = new THREE.CylinderGeometry(0.16, 0.16, 12.2, 24)
      stageDisposables.push(felt, wood, tableGeometry, railGeometry)
      const table = new THREE.Mesh(tableGeometry, felt)
      table.position.set(0, TABLE_TOP - 0.151, 0.5)
      table.receiveShadow = true
      const rail = new THREE.Mesh(railGeometry, wood)
      rail.rotation.z = Math.PI / 2
      rail.position.set(0, TABLE_TOP, 3.3)
      const faceLight = new THREE.SpotLight('#ffe7d2', 60, 20, Math.PI / 9, 0.7, 1.2)
      faceLight.position.set(1.8, 6.5, 3.5)
      faceLight.target.position.set(0, 2.4, DEALER_Z)
      const backLight = new THREE.DirectionalLight('#ffe2c4', 0.7)
      backLight.position.set(-2, 4, -6)
      stage.add(table, rail, faceLight, faceLight.target, backLight)

      loadDealer(dealerRef.current)
    }
    const loadDealer = (kind: DealerKind) => {
      if (rigKind === kind) return
      rigKind = kind
      const token = ++loadToken
      if (rig) { stage.remove(rig.root); rig.dispose(); rig = null }
      setCaption(null)
      setDealerStatus('loading')
      const anisotropy = renderer.capabilities.getMaxAnisotropy()
      const source = (DEALERS[kind] ?? DEALERS.medic).source
      const load: Promise<Dealer> = source.type === 'procedural'
        ? ProceduralDealer.load()
        : source.type === 'rocketbox'
        ? DealerRig.load(anisotropy)
        : source.url().then((url): Promise<Dealer> => source.type === 'vrm'
          ? VrmDealer.load(url, anisotropy)
          : StaticDealer.load(url, anisotropy, source.type === 'figure'))
      load.then(loaded => {
        if (disposed || token !== loadToken) { loaded.dispose(); return }
        rig = loaded
        rig.root.position.set(0, FLOOR_Y, DEALER_Z)
        stage.add(rig.root)
        setDealerStatus('ready')
        if (currentView === 'dealer') rig.say('Welcome to the table. Place your bets, please.', { gesture: 'wave', muted: mutedRef.current, onCaption: setCaption })
      }).catch(() => { if (!disposed && token === loadToken) setDealerStatus('error') })
    }
    const setDealer = (kind: DealerKind) => {
      if (stage.children.length) loadDealer(kind)
    }
    const setView = (next: TableView) => {
      if (compact) return
      currentView = next
      stage.visible = next === 'dealer'
      shadowCatcher.visible = next === 'wheel'
      if (next === 'dealer') buildStage()
      else setCaption(null)
      resetView()
    }
    const announce = ({ text, gesture }: Announcement) => {
      if (currentView !== 'dealer' || !rig) return
      rig.say(text, { gesture, muted: mutedRef.current, onCaption: setCaption })
    }

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect()
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      controls.handleResize()
    }
    resize()
    setView(currentView)
    // Keep the scene framed on resize unless the player has zoomed.
    const observer = new ResizeObserver(() => {
      const untouched = Math.abs(camera.position.distanceTo(controls.target) - fitted) < 0.05
      resize()
      if (untouched) resetView()
    })
    observer.observe(mount)
    // Nothing is drawn while the wheel is scrolled out of view or covered.
    let onScreen = true
    const visibility = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting })
    visibility.observe(mount)

    let theta = 0
    let spinState: SpinState | null = null
    let last = performance.now()

    // Sound follows the simulation: these track the ball between frames to detect contacts.
    const slice = TAU / VARIANTS[variant].wheelOrder.length
    const diamondAngles = Array.from({ length: 8 }, (_, i) => (i / 8) * TAU + slice / 3)
    const listenerSpace = new THREE.Vector3()
    let sound: RouletteSound | null = null
    let audio = { world: 0, theta: 0, radius: POCKET_R, hop: 0, kick: 0, fret: 0, lastTick: 0, launched: false }
    const angleGap = (a: number, b: number) => Math.abs(((a - b) % TAU + TAU + Math.PI) % TAU - Math.PI)
    /** Where the ball is relative to the camera: stereo pan and a distance-based loudness. */
    const listen = () => {
      listenerSpace.copy(ball.getWorldPosition(listenerSpace)).applyMatrix4(camera.matrixWorldInverse)
      const reference = camera.position.distanceTo(controls.target)
      return {
        pan: Math.max(-1, Math.min(1, listenerSpace.x / 2.2)) * 0.85,
        proximity: Math.max(0.35, Math.min(1.6, (reference / Math.max(0.5, listenerSpace.length())) ** 2))
      }
    }

    const startSpin = ({ id, pocket }: SpinRequest) => {
      const target = pocketAngle(pocket)
      const rel0 = ballAngle
      const backwards = ((rel0 - target) % TAU + TAU) % TAU
      // The ball laps the rotor clockwise; the rotor spins counter-clockwise.
      spinState = { id, startedAt: performance.now(), theta0: theta, rotorTurn: TAU * 2.2, rel0, relTravel: -(TAU * BALL_LAPS + backwards), r0: POCKET_R, target, pocket }
      scene.add(ball)
      glow.intensity = 0
      sound = RouletteSound.get()
      sound?.start()
      audio = { world: theta + rel0, theta, radius: POCKET_R, hop: 0, kick: 0, fret: Math.floor(rel0 / slice + 0.5), lastTick: 0, launched: false }
      // The croupier's sweeping hand gesture launches the ball.
      if (currentView === 'dealer') rig?.play('present')
    }
    apiRef.current = { startSpin, resetView, setView, setDealer, announce }
    if (pendingSpinRef.current) startSpin(pendingSpinRef.current)

    let lastDrawn = 0
    renderer.setAnimationLoop(now => {
      if (!onScreen) { last = now; return }
      // A wheel turning on its own needs no more than 30 frames a second; a spin gets them all.
      if (!spinState && now - lastDrawn < IDLE_FRAME_MS) return
      lastDrawn = now
      // A long gap means the tab was hidden; the spin catches up in one frame, so skip its clicks.
      const caughtUp = now - last > 150
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      if (spinState) {
        const elapsed = (now - spinState.startedAt) / 1000
        const u = clamp01(elapsed / SPIN_SECONDS)
        theta = spinState.theta0 + IDLE_SPEED * elapsed + spinState.rotorTurn * easeOutQuad(u)

        const bounce = clamp01((u - BOUNCE.start) / (BOUNCE.end - BOUNCE.start))
        const inBounce = u > BOUNCE.start && u < BOUNCE.end
        const wobble = inBounce ? 0.22 * Math.sin(Math.PI * BOUNCE.hops * bounce) * (1 - bounce) : 0
        const rel = spinState.rel0 + spinState.relTravel * easeOutBall(u) + wobble

        let radius: number
        if (u < LAUNCH) radius = lerp(spinState.r0, TRACK_R, smooth(u / LAUNCH))
        else if (u < DROP) radius = TRACK_R
        else if (u < BOUNCE.start) radius = lerp(TRACK_R, 0.9, smooth((u - DROP) / (BOUNCE.start - DROP)))
        else if (u < BOUNCE.end) radius = lerp(0.9, POCKET_R, bounce) + 0.06 * Math.abs(Math.sin(Math.PI * 3 * bounce)) * (1 - bounce)
        else radius = POCKET_R
        const hop = inBounce ? 0.05 * Math.abs(Math.sin(Math.PI * BOUNCE.hops * bounce)) * (1 - bounce) : 0
        const launch = u < LAUNCH ? 0.08 * Math.sin(Math.PI * (u / LAUNCH)) : 0

        const world = theta + rel
        ball.position.set(Math.cos(world) * radius, surfaceY(radius) + BALL_R + hop + launch, -Math.sin(world) * radius)

        if (sound && dt > 0 && !caughtUp) {
          const { pan, proximity } = listen()
          const ballSpeed = (world - audio.world) / dt
          const rotorSpeed = (theta - audio.theta) / dt
          const onRotor = radius < 1.0
          sound.update({
            speed: Math.abs(onRotor ? ballSpeed - rotorSpeed : ballSpeed),
            contact: launch < 0.004 && hop < 0.004,
            surface: onRotor ? 'rotor' : 'track',
            pan,
            proximity,
            rotorSpeed: Math.abs(rotorSpeed)
          })
          // The flicked ball lands on the track.
          if (!audio.launched && u >= LAUNCH) { audio.launched = true; sound.impact('track', 0.7, pan, proximity) }
          // Dropping off the track: a hard clack if a deflector diamond is in the way.
          if (audio.radius > 1.17 && radius <= 1.17) {
            const hitDiamond = diamondAngles.some(angle => angleGap(angle, world) < 0.24)
            sound.impact(hitDiamond ? 'diamond' : 'track', hitDiamond ? 1 : 0.35, pan, proximity)
          }
          if (inBounce) {
            // Each landing between hops, and each sideways kick off the pocket walls.
            const hopIndex = Math.floor(BOUNCE.hops * bounce)
            if (hopIndex !== audio.hop) { audio.hop = hopIndex; sound.impact('pocket', 0.25 + 0.85 * (1 - bounce), pan, proximity) }
            const kick = Math.floor(3 * bounce)
            if (kick !== audio.kick) { audio.kick = kick; sound.impact('fret', 0.2 + 0.7 * (1 - bounce), pan, proximity) }
          }
          // Skittering across the metal frets between pockets.
          // From the first bounce on, the ball is riding over the fret tops and pockets.
          if (u > BOUNCE.start - 0.02) {
            const fret = Math.floor(rel / slice + 0.5)
            if (fret !== audio.fret && now - audio.lastTick > 22) {
              const relative = Math.abs(ballSpeed - rotorSpeed)
              sound.impact('fret', 0.12 + Math.min(0.55, relative / 5), pan, proximity)
              audio.lastTick = now
            }
            audio.fret = fret
          }
          audio.world = world
          audio.theta = theta
          audio.radius = radius
        }

        if (u >= 1) {
          const { id, target, pocket } = spinState
          spinState = null
          pendingSpinRef.current = null
          ballAngle = restIn(pocket)
          glow.position.set(Math.cos(target) * POCKET_R, 0.18, -Math.sin(target) * POCKET_R)
          glow.intensity = 1.6
          if (sound) {
            // Settling: a last knock into the pocket and a tiny rattle, then the wheel quietens.
            const { pan, proximity } = listen()
            sound.impact('pocket', 0.4, pan, proximity)
            window.setTimeout(() => sound?.impact('fret', 0.14, pan, proximity), 90)
            window.setTimeout(() => sound?.impact('fret', 0.07, pan, proximity), 210)
            sound.update({ speed: 0, contact: true, surface: 'rotor', pan, proximity, rotorSpeed: IDLE_SPEED })
            sound.finish(1.5)
          }
          onSettledRef.current?.(id)
        }
      } else {
        theta += IDLE_SPEED * dt
        if (glow.intensity > 0) glow.intensity = 1.2 + 0.5 * Math.sin(now / 260)
      }

      rotor.rotation.y = theta
      if (stage.visible) rig?.update(dt)
      controls.update()
      renderer.render(scene, camera)
    })

    return () => {
      disposed = true
      apiRef.current = null
      rig?.dispose()
      stageDisposables.forEach(item => item.dispose())
      observer.disconnect()
      visibility.disconnect()
      renderer.setAnimationLoop(null)
      controls.dispose()
      controlsRef.current = null
      parts.dispose()
      shadowCatcher.geometry.dispose()
      ;(shadowCatcher.material as THREE.Material).dispose()
      environment.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [variant, compact])

  useEffect(() => { apiRef.current?.setView(view) }, [view])
  useEffect(() => { if (controlsRef.current) controlsRef.current.enabled = interactive }, [interactive])
  useEffect(() => { apiRef.current?.setDealer(dealer) }, [dealer])

  const lastAnnouncement = useRef<number | null>(null)
  useEffect(() => {
    if (!announcement || announcement.id === lastAnnouncement.current) return
    lastAnnouncement.current = announcement.id
    apiRef.current?.announce(announcement)
  }, [announcement])

  const lastSpinId = useRef<number | null>(null)
  useEffect(() => {
    if (!spin || spin.id === lastSpinId.current) return
    lastSpinId.current = spin.id
    pendingSpinRef.current = spin
    apiRef.current?.startSpin(spin)
  }, [spin])

  return (
    <div className={`wheel-3d${compact ? ' is-compact' : ''}${interactive ? '' : ' is-static'}`}>
      <div className="wheel-canvas" ref={mountRef} role="img" aria-label={`3D ${variant.toLowerCase()} roulette wheel.${interactive ? ' Drag to rotate, scroll to zoom.' : ''}`} />
      {!compact && view === 'dealer' && dealerStatus === 'loading' && <div className="dealer-loading" role="status"><span className="spinner" aria-hidden="true" />Calling the dealer…</div>}
      {!compact && view === 'dealer' && dealerStatus === 'error' && <div className="dealer-loading" role="alert">The dealer couldn’t be loaded. The wheel still works.</div>}
      {!compact && view === 'dealer' && caption && <p className="dealer-caption" aria-live="polite">{caption}</p>}
      {!compact && view === 'dealer' && DEALERS[dealer]?.credit && (
        <p className="dealer-credit">
          Model: <a href={DEALERS[dealer].credit!.href} target="_blank" rel="noreferrer">{DEALERS[dealer].credit!.text}</a>, <a href={DEALERS[dealer].credit!.licenseHref} target="_blank" rel="noreferrer">{DEALERS[dealer].credit!.license}</a>
        </p>
      )}
      {!compact && interactive && (
        <div className="wheel-hint">
          <span>Drag to rotate · Scroll to zoom</span>
          <button type="button" onClick={() => apiRef.current?.resetView()}>Reset view</button>
        </div>
      )}
    </div>
  )
}
