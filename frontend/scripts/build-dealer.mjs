// Builds the dealer asset bundle from Microsoft Rocketbox (MIT) source files.
//
//   node frontend/scripts/build-dealer.mjs <rocketbox-raw-dir>
//
// The raw dir must contain Business_Female_01_facial.fbx, the f014_*.tga textures and the
// f_*.fbx animations listed below. Output goes to frontend/public/dealer/.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'

// Minimal browser stubs for FBXLoader (texture images) and GLTFExporter (FileReader).
globalThis.self = globalThis
globalThis.document = { createElementNS: () => ({ addEventListener () {}, removeEventListener () {}, style: {} }) }
globalThis.FileReader = class {
  readAsArrayBuffer (blob) { blob.arrayBuffer().then(buffer => { this.result = buffer; this.onloadend?.() }) }
  readAsDataURL (blob) {
    blob.arrayBuffer().then(buffer => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`
      this.onloadend?.()
    })
  }
}
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')

const rawDir = process.argv[2]
if (!rawDir) throw new Error('Usage: node build-dealer.mjs <rocketbox-raw-dir>')
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'dealer')
mkdirSync(outDir, { recursive: true })

const MODEL = 'Business_Female_01_facial.fbx'
const ANIMATIONS = {
  idle: 'f_idle_breathe_01.fbx',
  talk: 'f_gestic_talk_neutral_01.fbx',
  present: 'f_gestic_presentation_right_01.fbx',
  wave: 'f_wave_01.fbx'
}
// Only the blendshapes the dealer uses: 15 visemes, blinks, smile and brows.
const KEEP_MORPHS = [
  ...['00_Sil', '01_PP', '02_FF', '03_TH', '04_DD', '05_KK', '06_CH', '07_SS', '08_nn', '09_RR', '10_aa', '11_E', '12_I', '13_O', '14_U'].map(v => `AA_VI_${v}`),
  'AK_09_EyeBlinkLeft', 'AK_10_EyeBlinkRight', 'AK_44_MouthSmileLeft', 'AK_45_MouthSmileRight', 'AK_03_BrowInnerUp'
]

const MAX_CLIP_SECONDS = 10

const loadFbx = file => {
  const buffer = readFileSync(join(rawDir, file))
  return new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '')
}

/** Copies the vertices used by one material group into its own geometry, keeping skin and morph data. */
function extractGroups (source, groups, morphIndices) {
  const index = source.index ? source.index.array : null
  const remap = new Map()
  const order = []
  const indices = []
  for (const group of groups) {
    for (let i = group.start; i < group.start + group.count; i++) {
      const vertex = index ? index[i] : i
      if (!remap.has(vertex)) { remap.set(vertex, order.length); order.push(vertex) }
      indices.push(remap.get(vertex))
    }
  }
  const pick = attribute => {
    const array = new attribute.array.constructor(order.length * attribute.itemSize)
    order.forEach((vertex, i) => {
      for (let k = 0; k < attribute.itemSize; k++) array[i * attribute.itemSize + k] = attribute.array[vertex * attribute.itemSize + k]
    })
    return new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized)
  }
  const geometry = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
    if (source.attributes[name]) geometry.setAttribute(name, pick(source.attributes[name]))
  }
  geometry.setIndex(indices)

  const morphs = morphIndices
    .map(({ name, index: m }) => ({ name, attribute: pick(source.morphAttributes.position[m]) }))
    .filter(({ attribute }) => attribute.array.some(value => Math.abs(value) > 1e-4))
  if (morphs.length) {
    geometry.morphAttributes.position = morphs.map(m => m.attribute)
    geometry.morphTargetsRelative = source.morphTargetsRelative
  }
  return { geometry, morphNames: morphs.map(m => m.name) }
}

const model = loadFbx(MODEL)
const source = model.getObjectByProperty('isSkinnedMesh', true)
const dictionary = source.morphTargetDictionary
const morphIndices = KEEP_MORPHS.map(short => {
  const full = Object.keys(dictionary).find(name => name.endsWith(`.${short}`))
  if (!full) throw new Error(`Missing blendshape ${short}`)
  return { name: short, index: dictionary[full] }
})

// Split the single mesh by material so only the head carries blendshape data.
const parent = source.parent
const materials = [].concat(source.material)
const byMaterial = Map.groupBy(source.geometry.groups, group => group.materialIndex)
for (const [materialIndex, groups] of byMaterial) {
  const material = materials[materialIndex]
  const { geometry, morphNames } = extractGroups(source.geometry, groups, morphIndices)
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ name: material.name }))
  mesh.name = material.name
  if (morphNames.length) {
    mesh.morphTargetDictionary = Object.fromEntries(morphNames.map((name, i) => [name, i]))
    mesh.morphTargetInfluences = morphNames.map(() => 0)
  }
  mesh.bind(source.skeleton, source.bindMatrix)
  parent.add(mesh)
  console.log(`mesh ${mesh.name}: ${geometry.attributes.position.count} vertices, ${morphNames.length} blendshapes`)
}
parent.remove(source)

// Animations: keep bone rotations only, so clips recorded on a slightly different body don't stretch this one.
const boneNames = new Set()
model.traverse(object => { if (object.isBone) boneNames.add(object.name) })
const clips = Object.entries(ANIMATIONS).map(([name, file]) => {
  const clip = loadFbx(file).animations[0]
  const tracks = clip.tracks.filter(track => {
    const [node, property] = track.name.split('.')
    return property === 'quaternion' && boneNames.has(node) && node !== 'Bip01'
  })
  let result = new THREE.AnimationClip(name, clip.duration, tracks).optimize()
  if (result.duration > MAX_CLIP_SECONDS) result = THREE.AnimationUtils.subclip(result, name, 0, MAX_CLIP_SECONDS * 30, 30)
  console.log(`clip ${name}: ${result.duration.toFixed(2)}s, ${result.tracks.length} tracks`)
  return result
})

model.animations = []
const glb = await new Promise((resolve, reject) => {
  new GLTFExporter().parse(model, resolve, reject, { binary: true, animations: clips, onlyVisible: false })
})
writeFileSync(join(outDir, 'dealer.glb'), Buffer.from(glb))
console.log(`dealer.glb: ${(glb.byteLength / 1e6).toFixed(2)} MB`)

// Textures: JPEG for colour/normal maps, PNG where alpha matters (hair and lashes).
const textures = [
  ['f014_head_color.tga', 'head_color.jpg', 2048],
  ['f014_head_normal.tga', 'head_normal.jpg', 1024],
  ['f014_body_color.tga', 'body_color.jpg', 1024],
  ['f014_body_normal.tga', 'body_normal.jpg', 1024],
  ['f014_opacity_color.tga', 'opacity_color.png', 1024]
]
for (const [input, output, size] of textures) {
  const format = output.endsWith('.png') ? 'png' : 'jpeg'
  execFileSync('sips', ['-s', 'format', format, ...(format === 'jpeg' ? ['-s', 'formatOptions', '82'] : []), '-Z', String(size), join(rawDir, input), '--out', join(outDir, output)], { stdio: 'ignore' })
}
console.log('textures written')
