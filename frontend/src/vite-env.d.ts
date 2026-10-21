/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The API's origin for app builds, e.g. https://api.example.com (empty in the browser). */
  readonly VITE_API_ORIGIN?: string
  /** The website invites link to, e.g. https://roulette.example.com (the browser uses its own address). */
  readonly VITE_PUBLIC_URL?: string
}
