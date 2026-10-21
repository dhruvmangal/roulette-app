declare module 'virtual:dealer-candidates' {
  /** Trial dealer models from assets-src/candidates/ (dev server only; empty in builds). */
  const candidates: { file: string, url: string }[]
  export default candidates
}
