/** Per-device preferences in localStorage; reads fall back and writes are skipped if it is unavailable. */
export const readSetting = (key: string, fallback: string) => {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

export const writeSetting = (key: string, value: string) => {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}
