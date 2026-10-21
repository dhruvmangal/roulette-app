import { useSyncExternalStore } from 'react'

/** A tiny history router for paths under /admin/ (nginx serves index.html for all of them). */

const BASE = '/admin'
const listeners = new Set<() => void>()

const current = () => {
  const path = window.location.pathname.startsWith(BASE) ? window.location.pathname.slice(BASE.length) : '/'
  return (path || '/') + window.location.search
}

window.addEventListener('popstate', () => listeners.forEach(listener => listener()))

export function navigate (to: string, { replace = false } = {}) {
  const url = BASE + to
  if (url === window.location.pathname + window.location.search) return
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url)
  listeners.forEach(listener => listener())
  if (!replace) window.scrollTo(0, 0)
}

/** The current path below /admin, with its query string, e.g. "/players?search=ana". */
export function useLocation () {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    current
  )
}

export const splitLocation = (location: string) => {
  const [path, search = ''] = location.split('?')
  return { path, params: new URLSearchParams(search) }
}

/** Replaces some query params on the current path, dropping empty ones. */
export function setParams (path: string, params: URLSearchParams, changes: Record<string, string | number | undefined>) {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') next.delete(key)
    else next.set(key, String(value))
  }
  const search = next.toString()
  navigate(path + (search ? `?${search}` : ''), { replace: true })
}
