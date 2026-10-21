import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, createApiClient, type ApiClient, type TokenStore } from '@roulette/api-client'
import type { AuthProviders, AuthResult, PlayerProfile, ProviderToken, Tokens, TokenProvider } from '@roulette/contracts'
import { RemoteWalletAdapter, connectRoulette } from '@roulette/game-client'
import type { Socket } from 'socket.io-client'
import { apiOrigin } from './platform'
import { collectDeviceReport } from './deviceReport'
import { onForeground } from './native'
import { disablePush } from './push'

const DEVICE_REPORT_EVERY_MS = 30 * 60 * 1000

const TOKENS_KEY = 'roulette.session'

/**
 * Keeps the token pair in localStorage so a reload stays signed in. Falls back to memory when
 * storage is unavailable (private windows), which signs the player out on reload.
 */
function deviceTokenStore (): TokenStore {
  let memory: Tokens | null = null
  return {
    get () {
      try {
        const stored = JSON.parse(localStorage.getItem(TOKENS_KEY) ?? 'null')
        return stored?.accessToken && stored?.refreshToken ? stored : memory
      } catch { return memory }
    },
    set (tokens) {
      memory = tokens
      try {
        if (tokens) localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
        else localStorage.removeItem(TOKENS_KEY)
      } catch { /* storage unavailable: memory only */ }
    }
  }
}

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn'

export interface Session {
  status: SessionStatus
  player: PlayerProfile | null
  /** Online chips; null until loaded or when signed out. */
  balance: number | null
  /** Sign-in buttons the server has turned on. */
  providers: AuthProviders | null
  api: ApiClient
  /** The /roulette socket while signed in. */
  socket: Socket | null
  /** Whether that socket is connected right now (false while it reconnects). */
  connected: boolean
  signIn: (provider: TokenProvider, token: ProviderToken) => Promise<AuthResult>
  /** Inside a Discord Activity: signs in with the login code Discord's SDK gave the app. */
  signInWithDiscord: (code: string) => Promise<AuthResult>
  playAsGuest: () => Promise<AuthResult>
  /** Links Google/Apple to the signed-in player; saves a guest's account. */
  link: (provider: TokenProvider, token: ProviderToken) => Promise<void>
  logout: (everywhere?: boolean) => Promise<void>
  refreshWallet: () => Promise<void>
}

const SessionContext = createContext<Session | null>(null)

const tokens = deviceTokenStore()
const api = createApiClient({ baseUrl: apiOrigin, tokens })

export function SessionProvider ({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(() => tokens.get() ? 'loading' : 'signedOut')
  const [player, setPlayer] = useState<PlayerProfile | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [providers, setProviders] = useState<AuthProviders | null>(null)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [wallet, setWallet] = useState<RemoteWalletAdapter | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    api.providers().then(result => setProviders(result.providers)).catch(() => setProviders({ google: null, apple: null, discord: null }))
  }, [])

  // Resume a saved session: the api-client refreshes an expired access token on its own.
  useEffect(() => {
    if (!tokens.get()) return
    api.me()
      .then(({ player: profile, wallet: current }) => {
        setPlayer(profile)
        setBalance(current.balance)
        setStatus('signedIn')
      })
      .catch((error: unknown) => {
        // A network failure keeps the tokens for next time; a refused session is over.
        if (!(error instanceof ApiError) || error.status !== 0) tokens.set(null)
        setStatus('signedOut')
      })
  }, [])

  // While signed in: tell the server which device this is and how it's connected,
  // at sign-in and when the app comes back to the foreground (at most every half hour).
  useEffect(() => {
    if (status !== 'signedIn') return
    let lastSent = 0
    const report = () => {
      if (Date.now() - lastSent < DEVICE_REPORT_EVERY_MS) return
      lastSent = Date.now()
      void collectDeviceReport().then(api.recordDevice).catch(() => {})
    }
    report()
    return onForeground(report)
  }, [status, player?.playerId])

  // While signed in: one socket, and a wallet that follows wallet:updated.
  useEffect(() => {
    if (status !== 'signedIn') return
    const connection = connectRoulette({ baseUrl: apiOrigin, getAccessToken: () => tokens.get()?.accessToken ?? null })
    // `active` is false only when the server refused the handshake (an expired access token):
    // refresh it and try again. Network failures retry by themselves.
    connection.on('connect_error', () => {
      if (connection.active) return
      void api.refresh().then(refreshed => { if (refreshed) connection.connect() })
    })
    connection.on('connect', () => setConnected(true))
    connection.on('disconnect', () => setConnected(false))
    const adapter = new RemoteWalletAdapter({ api, socket: connection })
    const stop = adapter.subscribe(setBalance)
    setSocket(connection)
    setWallet(adapter)
    return () => {
      stop()
      adapter.dispose()
      connection.disconnect()
      setConnected(false)
      setSocket(null)
      setWallet(null)
    }
  }, [status])

  const started = useCallback((result: AuthResult) => {
    setPlayer(result.player)
    setBalance(result.wallet?.balance ?? null)
    setStatus('signedIn')
    return result
  }, [])

  const value = useMemo<Session>(() => ({
    status,
    player,
    balance,
    providers,
    api,
    socket,
    connected,
    signIn: async (provider, token) => started(await api.signIn(provider, token)),
    signInWithDiscord: async (code) => started(await api.signInWithDiscord(code)),
    playAsGuest: async () => started(await api.guest()),
    link: async (provider, token) => {
      const { player: profile } = await api.linkProvider(provider, token)
      setPlayer(profile)
    },
    logout: async (everywhere = false) => {
      // This phone stops getting the account's notifications before its sign-in is gone.
      await disablePush(api)
      if (everywhere) await api.logoutEverywhere().catch(() => tokens.set(null))
      else await api.logout()
      setPlayer(null)
      setBalance(null)
      setStatus('signedOut')
    },
    refreshWallet: async () => { await wallet?.refresh() }
  }), [status, player, balance, providers, socket, connected, wallet, started])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession (): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionProvider')
  return session
}

/** A server error's message, or a friendly fallback. */
export function errorMessage (error: unknown): string {
  if (error instanceof ApiError) return error.status === 0 ? 'Could not reach the server. Check your connection.' : error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}
