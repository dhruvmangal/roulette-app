import type {
  ArcadeRound, CrashRound, HorsesRound, PlinkoRound, WheelRound,
  AchievementsPage, DeferredLink, ApiErrorDetail, AuthProviders, AuthResult, BonusOffer, CreateRoomInput, DeviceReport, Envelope, Friend, FriendRequestResult, FriendsList, HistoryRound, IdentityProvider, Leaderboard,
  LeaderboardPeriod, MyTable, NotificationCategory, NotificationSettings, RegisterPushTokenInput, PlayerProfile, PlayerStats, ReferralPage, StatsPeriod, ProviderToken, TokenProvider,
  PublicRoom, RoomState, Tokens, Wallet, WalletTransaction, WalletTransactionType
} from '@roulette/contracts'
import type { ArcadeGame, ArcadeRisk, CrashGame, HorseBet, VariantName } from '@roulette/engine'

/** Where the client keeps the signed-in player's tokens (memory, localStorage, secure storage, ...). */
export interface TokenStore {
  get (): Tokens | null
  set (tokens: Tokens | null): void
}

export function memoryTokenStore (initial: Tokens | null = null): TokenStore {
  let tokens = initial
  return { get: () => tokens, set: next => { tokens = next } }
}

/** A failed request: the HTTP status plus the server's errors (status 0 when the network failed). */
export class ApiError extends Error {
  readonly status: number
  readonly errors: ApiErrorDetail[]

  constructor (status: number, errors: ApiErrorDetail[]) {
    super(errors[0]?.description ?? `Request failed (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }

  get errorCode (): number | undefined {
    return this.errors[0]?.errorCode
  }
}

export interface ApiClientOptions {
  /** e.g. 'https://roulette.example' or '' for the same origin. */
  baseUrl: string
  tokens: TokenStore
  fetch?: typeof fetch
}

export interface Page<T> { rows: T[], count: number }

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'
// Without a connection a request can hang until the OS gives up; fail sooner so
// the app can say it's offline.
const REQUEST_TIMEOUT_MS = 10000
const UNAUTHORIZED = [401, 403]
// How the server answers a refresh token it will not honour (invalid, revoked, banned).
const REFUSED = [400, 401, 403]

export function createApiClient ({ baseUrl, tokens, fetch: fetchImpl = globalThis.fetch.bind(globalThis) }: ApiClientOptions) {
  let refreshing: Promise<boolean> | null = null

  async function send<T> (method: Method, path: string, body?: unknown, auth = true): Promise<T> {
    const accessToken = auth ? tokens.get()?.accessToken : undefined
    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}/api/v1${path}`, {
        method,
        headers: {
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...(accessToken && { Authorization: `Bearer ${accessToken}` })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch {
      throw new ApiError(0, [{ name: 'NetworkError', description: 'Could not reach the server' }])
    }
    const envelope = await response.json().catch(() => null) as Envelope<T> | null
    if (response.ok && envelope && !envelope.errors?.length) return envelope.data
    throw new ApiError(response.status, envelope?.errors ?? [])
  }

  /**
   * Swaps the refresh token for a new pair; concurrent callers share one refresh. Only a refusal
   * from the server ends the session: a network blip or server error keeps the tokens to retry.
   */
  function refresh (): Promise<boolean> {
    const refreshToken = tokens.get()?.refreshToken
    if (!refreshToken) return Promise.resolve(false)
    refreshing ??= send<AuthResult>('POST', '/auth/refresh', { refreshToken }, false)
      .then(result => { tokens.set(result.tokens); return true })
      .catch((error: unknown) => {
        if (error instanceof ApiError && REFUSED.includes(error.status)) tokens.set(null)
        return false
      })
      .finally(() => { refreshing = null })
    return refreshing
  }

  /** An authenticated request; an expired access token is refreshed once and the request retried. */
  async function call<T> (method: Method, path: string, body?: unknown): Promise<T> {
    try {
      return await send<T>(method, path, body)
    } catch (error) {
      if (!(error instanceof ApiError) || !UNAUTHORIZED.includes(error.status) || !await refresh()) throw error
      return send<T>(method, path, body)
    }
  }

  const signedIn = async (request: Promise<AuthResult>) => {
    const result = await request
    tokens.set(result.tokens)
    return result
  }

  const query = (params: Record<string, string | number | undefined>) => {
    const entries = Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])
    return entries.length ? `?${new URLSearchParams(entries)}` : ''
  }

  return {
    // Auth
    /** Which sign-in buttons to show, with their client IDs. */
    providers: () => send<{ providers: AuthProviders }>('GET', '/auth/providers', undefined, false),
    /** Signs in with the ID token from Google or Apple; the first sign-in creates the player. */
    signIn: (provider: TokenProvider, token: ProviderToken) => signedIn(send('POST', `/auth/${provider}`, token, false)),
    /** Signs in inside a Discord Activity with the login code Discord's SDK gave the app. */
    signInWithDiscord: (code: string) => signedIn(send('POST', '/auth/discord', { code }, false)),
    guest: () => signedIn(send('POST', '/auth/guest', undefined, false)),
    refresh,
    /** Ends this login on the server (its refresh token stops working) and forgets the tokens. */
    logout: async () => {
      const refreshToken = tokens.get()?.refreshToken
      tokens.set(null)
      if (refreshToken) await send('POST', '/auth/logout', { refreshToken }, false).catch(() => {})
    },
    /** Signs this player out on every device. */
    logoutEverywhere: async () => {
      await call('POST', '/auth/logout-all')
      tokens.set(null)
    },
    /** Links a Google or Apple account to the signed-in player; for a guest this saves the account. */
    linkProvider: (provider: TokenProvider, token: ProviderToken) => call<{ player: PlayerProfile }>('POST', `/auth/link/${provider}`, token),

    // Player and wallet
    me: () => call<{ player: PlayerProfile, wallet: Wallet }>('GET', '/players/me'),
    history: (page: { limit?: number, pageNo?: number } = {}) => call<{ rounds: HistoryRound[] }>('GET', `/players/me/history${query(page)}`),
    /** Betting habits over a period; days and hours are counted in `tz` (IANA). */
    stats: (period: StatsPeriod = 'month', tz?: string) => call<PlayerStats>('GET', `/players/me/stats${query({ period, tz })}`),
    /** Open tables the player is still seated at, to offer a rejoin. */
    myTables: () => call<{ tables: MyTable[] }>('GET', '/players/me/tables'),
    /** Reports the device and connection the app runs on; the server adds the IP and its rough place. */
    recordDevice: (report: DeviceReport) => call<{ recorded: boolean }>('POST', '/players/me/devices', report),
    leaderboard: (period: LeaderboardPeriod = 'week') => call<Leaderboard>('GET', `/players/leaderboard${query({ period })}`),
    wallet: () => call<{ wallet: Wallet }>('GET', '/wallet'),
    transactions: (filter: { limit?: number, pageNo?: number, type?: WalletTransactionType, from?: string, to?: string } = {}) =>
      call<{ transactions: Page<WalletTransaction> }>('GET', `/wallet/transactions${query(filter)}`),

    // Arcade: each play carries a requestId, so a retry after a dropped connection can't stake twice.
    playPlinko: (input: { stake: number, rows: number, risk: ArcadeRisk, requestId: string }) => call<{ round: PlinkoRound, wallet: Wallet }>('POST', '/arcade/plinko/play', input),
    playWheel: (input: { stake: number, risk: ArcadeRisk, requestId: string }) => call<{ round: WheelRound, wallet: Wallet }>('POST', '/arcade/wheel/play', input),
    playHorses: (input: { bets: HorseBet[], requestId: string }) => call<{ round: HorsesRound, wallet: Wallet }>('POST', '/arcade/horses/play', input),
    startCrash: (input: { game: CrashGame, bets: Array<{ stake: number, autoCashout?: number | null }>, requestId: string }) => call<{ round: CrashRound, wallet: Wallet }>('POST', '/arcade/crash/start', input),
    /** Cashes a bet out at the multiplier showing on the server's clock; the answer says how the bet ended. */
    cashOutCrash: (arcadeRoundId: number, slot: number) => call<{ round: CrashRound, wallet: Wallet }>('POST', `/arcade/crash/${arcadeRoundId}/cashout`, { slot }),
    /** The flight still in the air, if any; one that has landed since comes back as `landed`. */
    activeCrash: (game: CrashGame) => call<{ round: CrashRound | null, landed: CrashRound | null, wallet?: Wallet }>('GET', `/arcade/crash/active${query({ game })}`),
    arcadeHistory: (filter: { game?: ArcadeGame, limit?: number } = {}) => call<{ rounds: ArcadeRound[] }>('GET', `/arcade/history${query(filter)}`),

    // Refer & earn
    referrals: () => call<ReferralPage>('GET', '/referrals/me'),
    /** Joins with a friend's code; the rewards follow once the player qualifies. */
    claimReferral: (code: string) => call<{ referredBy: { code: string } }>('POST', '/referrals/claim', { code }),

    /** On first launch of a new install: the invite or referral link this phone opened before installing, if any. */
    deferredLink: (platform: 'ios' | 'android') => call<{ link: DeferredLink | null }>('POST', '/links/deferred', { platform }),

    // Achievements
    achievements: () => call<AchievementsPage>('GET', '/achievements/me'),

    // Friends
    friends: () => call<FriendsList>('GET', '/friends'),
    /** Asks a player (by username) to be friends; if they had already asked, this accepts. */
    requestFriend: (username: string) => call<FriendRequestResult>('POST', '/friends/requests', { username }),
    acceptFriend: (friendshipId: number) => call<{ status: string, friend: Friend }>('POST', `/friends/requests/${friendshipId}/accept`),
    declineFriend: (friendshipId: number) => call<{ status: string }>('POST', `/friends/requests/${friendshipId}/decline`),
    /** Ends a friendship, or takes back a request the player sent. */
    removeFriend: (playerId: number) => call<{ removed: boolean }>('DELETE', `/friends/${playerId}`),
    /** Invites a friend to the table (by code) the player is sitting at. */
    inviteFriend: (playerId: number, code: string) => call<{ invited: boolean }>('POST', `/friends/${playerId}/invite`, { code }),

    // Push notifications
    notificationSettings: () => call<NotificationSettings>('GET', '/notifications/settings'),
    updateNotificationSettings: (prefs: Partial<Record<NotificationCategory, boolean>>) => call<NotificationSettings>('PUT', '/notifications/settings', { prefs }),
    registerPushToken: (input: RegisterPushTokenInput) => call<{ registered: boolean }>('POST', '/notifications/tokens', input),
    unregisterPushToken: (token: string) => call<{ removed: number }>('POST', '/notifications/tokens/remove', { token }),

    // Bonuses
    bonuses: () => call<{ bonuses: BonusOffer[] }>('GET', '/bonuses'),
    claimBonus: (code: string) => call<{ bonus: { code: string, amount: number, streakDay: number | null }, wallet: Wallet }>('POST', `/bonuses/${encodeURIComponent(code)}/claim`),

    // Rooms
    publicRooms: (variant?: VariantName) => call<{ rooms: PublicRoom[] }>('GET', `/rooms${query({ variant })}`),
    createRoom: (input: CreateRoomInput) => call<RoomState>('POST', '/rooms', input),
    quickMatch: (variant: VariantName) => call<RoomState>('POST', '/rooms/quick-match', { variant }),
    /** Sits at the private table for this Discord Activity, opening it if first. */
    joinDiscordTable: (instanceId: string, variant?: VariantName) => call<RoomState>('POST', '/rooms/discord', { instanceId, variant }),
    joinRoom: (code: string) => call<RoomState>('POST', '/rooms/join', { code: code.toUpperCase() }),
    room: (roomId: number) => call<RoomState>('GET', `/rooms/${roomId}`),
    leaveRoom: (roomId: number) => call<{ roomId: number, left: boolean }>('POST', `/rooms/${roomId}/leave`)
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
