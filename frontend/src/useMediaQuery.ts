import { useCallback, useSyncExternalStore } from 'react'

/** Phones held upright: the table splits into swipeable board and wheel pages. */
export const PHONE_PORTRAIT = '(max-width: 640px) and (orientation: portrait)'

/** Whether a CSS media query matches, following changes (rotation, resizing). */
export function useMediaQuery (query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const list = window.matchMedia(query)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
