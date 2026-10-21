import type * as THREE from 'three'
import candidates from 'virtual:dealer-candidates'

export type Gesture = 'idle' | 'talk' | 'present' | 'wave' | 'cheer' | 'sympathy'

/** Gestures every dealer can perform; the reaction gestures degrade to these on dealers without them. */
export type BaseGesture = 'idle' | 'talk' | 'present' | 'wave'
export const baseGesture = (gesture: Gesture): BaseGesture => gesture === 'cheer' ? 'wave' : gesture === 'sympathy' ? 'talk' : gesture

/** Key into DEALERS. */
export type DealerKind = string

export type DealerSource =
  | { type: 'procedural' }
  | { type: 'rocketbox' }
  | { type: 'bust', url: () => Promise<string> }
  | { type: 'figure', url: () => Promise<string> }
  | { type: 'vrm', url: () => Promise<string> }

export interface SayOptions {
  gesture?: Gesture
  muted: boolean
  onCaption?: (text: string | null) => void
}

/** What the table needs from a croupier, whether skeletal (lip-synced) or a static sculpt. */
export interface Dealer {
  readonly root: THREE.Object3D
  play: (gesture: Gesture) => void
  say: (text: string, options: SayOptions) => void
  update: (dt: number) => void
  dispose: () => void
}

export interface DealerInfo {
  label: string
  source: DealerSource
  /** Attribution shown in the dealer view, when the licence requires it. */
  credit?: { text: string, href: string, license: string, licenseHref: string }
}

const asset = (file: string) => () => Promise.resolve(`${import.meta.env.BASE_URL}dealer/${file}`)

export const DEALERS: Record<DealerKind, DealerInfo> = {
  noir: { label: 'Noir', source: { type: 'figure', url: asset('noir.glb') } },
  stylized: { label: 'Stylized', source: { type: 'procedural' } },
  medic: {
    label: 'Anime',
    source: { type: 'bust', url: asset('medic.glb') },
    credit: {
      text: '“Blonde Anime Medic Girl” by Farah Aziz',
      href: 'https://sketchfab.com/3d-models/blonde-anime-medic-girl-image-to-stl-supavoxel-2027a569e3084094b766aaf3c9b56582',
      license: 'CC BY 4.0, simplified',
      licenseHref: 'https://creativecommons.org/licenses/by/4.0/'
    }
  },
  classic: { label: 'Classic', source: { type: 'rocketbox' } }
}

// Dev only: models dropped in frontend/assets-src/candidates/ join the picker for side-by-side trials.
for (const { file, url } of candidates) {
  DEALERS[`candidate:${file}`] = {
    label: `Trial: ${file.replace(/\.(vrm|glb)$/i, '')}`,
    source: { type: /\.vrm$/i.test(file) ? 'vrm' : 'bust', url: () => Promise.resolve(url) }
  }
}
