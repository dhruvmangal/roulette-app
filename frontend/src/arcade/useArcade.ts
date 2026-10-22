import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { practiceArcade, remoteArcade, type ArcadeBackend, type LocalWalletAdapter } from '@roulette/game-client'
import { secureRandomInt } from '../game'
import { useSession } from '../session'

export interface Arcade {
  backend: ArcadeBackend
  /** True when playing with the signed-in wallet; false for practice chips. */
  online: boolean
  /** The balance on show. It trails the real one while a result is still being revealed. */
  balance: number
  /** Chips leave the balance on show (a stake, the moment it is placed). */
  take: (chips: number) => void
  /** Chips arrive in the balance on show (a result, the moment it is revealed). */
  give: (chips: number) => void
  /** Everything has been revealed: show the real balance and bring the top bar up to date. */
  settle: (balance: number) => void
}

/**
 * The arcade for the current player: the server's games for a signed-in player, the device's for
 * practice chips. A result is known the moment it is played but should not show in the balance (or
 * the top bar) until the animation has played it, so both are held back until `give` and `settle`.
 */
export function useArcade (practice: LocalWalletAdapter): Arcade {
  const { status, api, balance: walletBalance, refreshWallet } = useSession()
  const online = status === 'signedIn'

  // Practice chips are only written to the device once the result is revealed.
  const held = useRef<number | null>(null)
  const backend = useMemo(() => online
    ? remoteArcade(api)
    : practiceArcade({
      wallet: { getBalance: () => held.current ?? practice.getBalance(), set: next => { held.current = next } },
      randomInt: secureRandomInt
    }), [online, api, practice])

  const [balance, setBalance] = useState(() => (online ? walletBalance : practice.getBalance()) ?? 0)

  // Signing in or out changes whose chips these are.
  useEffect(() => {
    held.current = null
    setBalance((online ? walletBalance : practice.getBalance()) ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, practice])

  const flush = useCallback(() => {
    if (held.current === null) return
    practice.set(held.current)
    held.current = null
  }, [practice])
  // Leaving the page keeps whatever was played.
  useEffect(() => flush, [flush])

  const settle = useCallback((real: number) => {
    flush()
    setBalance(real)
    if (online) void refreshWallet().catch(() => {})
  }, [flush, online, refreshWallet])

  return {
    backend,
    online,
    balance,
    take: useCallback(chips => setBalance(current => current - chips), []),
    give: useCallback(chips => setBalance(current => current + chips), []),
    settle
  }
}
