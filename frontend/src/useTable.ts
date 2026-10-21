import { useCallback, useSyncExternalStore } from 'react'
import type { GameTransport, TableState } from '@roulette/game-client'

/** The live table snapshot from a transport, or null when not seated at a table. */
export function useTable (transport: GameTransport | null): TableState | null {
  const subscribe = useCallback((listener: () => void) => transport ? transport.subscribe(listener) : () => {}, [transport])
  const getSnapshot = useCallback(() => transport?.getState() ?? null, [transport])
  return useSyncExternalStore(subscribe, getSnapshot)
}
