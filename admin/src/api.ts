/** The admin REST API (/api/v1/admin). Every response is { data, errors }. */

const TOKEN_KEY = 'roulette.admin.token'

export interface ApiErrorItem { name?: string, description?: string, errorCode?: number, details?: unknown }

export class ApiError extends Error {
  constructor (readonly status: number, readonly errors: ApiErrorItem[]) {
    super(errors[0]?.description ?? `Request failed (${status})`)
  }
}

const storage = {
  get: () => { try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (token: string | null) => {
    try { token ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY) } catch {}
  }
}

let token = storage.get()
let onSignedOut = () => {}

export const auth = {
  get token () { return token },
  set (next: string | null) { token = next; storage.set(next) },
  onSignedOut (listener: () => void) { onSignedOut = listener }
}

type Query = Record<string, string | number | undefined | null>

const toSearch = (query?: Query) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

export async function api<T> (method: string, path: string, { query, body }: { query?: Query, body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api/v1/admin${path}${toSearch(query)}`, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const payload = await response.json().catch(() => ({ data: null, errors: [{ description: response.statusText }] }))
  if (!response.ok || payload.errors?.length) {
    if (response.status === 401 && path !== '/auth/login') {
      auth.set(null)
      onSignedOut()
    }
    throw new ApiError(response.status, payload.errors ?? [])
  }
  return payload.data as T
}

/** A readable message for an error from api(), including field validation details. */
export const errorText = (error: unknown) => {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : String(error)
  const first = error.errors[0]
  const details = first?.details && typeof first.details === 'object' ? Object.values(first.details as Record<string, unknown>).flat().join('; ') : ''
  return [first?.description ?? error.message, details].filter(Boolean).join(': ')
}

// ---- Response shapes ----

export interface Admin { adminUserId: number, email: string, name: string, lastLoginAt: string | null }

export interface DaySeries { date: string, signups: number, staked: number, paid: number, houseNet: number, bonuses: number }
export interface Stats {
  players: { total: number, guests: number, banned: number, newToday: number, activeToday: number }
  chips: { inCirculation: number, wallets: number }
  last24h: { staked: number, paid: number, refunded: number, bonuses: number, adminAdjusted: number, transactions: number, bettors: number, houseNet: number }
  tables: { open: number, roundsToday: number, seatedPlayers: number }
  series: DaySeries[]
}

export type PlayerStatus = 'active' | 'banned' | 'inactive'
export interface PlayerRow {
  playerId: number, username: string, isGuest: boolean, status: PlayerStatus, country: string | null
  lastLoginAt: string | null, createdAt: string, balance: number | null, providers: string[], email: string | null
}
export interface Page { count: number, pageNo: number, limit: number }

export interface PlayerDetail {
  player: { playerId: number, username: string, email: string | null, providers: string[], isGuest: boolean, status: PlayerStatus, country: string | null, lastLoginAt: string | null, createdAt: string, tokenVersion: number }
  wallet: { walletId: number, balance: number, lockedBalance: number, currency: string, version: number } | null
  identities: Array<{ provider: string, email: string | null, lastUsedAt: string, createdAt: string }>
  stats: { rounds: number, bets: number, staked: number, returned: number, net: number, biggestWin: number, lastBetAt: string | null, bonuses: number, adminAdjusted: number, transactions: number, activeSessions: number, lastRefreshAt: string | null }
  seats: Array<{ roomId: number, code: string, mode: string, variant: string, seat: number, joinedAt: string, awaySince: string | null }>
  devices: Device[]
  visits: Visit[]
  linkedAccounts: Array<{ playerId: number, username: string, status: PlayerStatus, isGuest: boolean, via: Array<'device' | 'ip'>, matches: number }>
  referrals: {
    code: string | null
    referredBy: { playerId: number, username: string, status: ReferralStatus, rejectReason: string | null } | null
    made: number, rewarded: number, earned: number
  } | null
}

export type ReferralStatus = 'PENDING' | 'REWARDED' | 'REJECTED'
export interface Referral {
  referralId: number, status: ReferralStatus, rejectReason: string | null, code: string
  referrerReward: number, refereeReward: number, createdAt: string, rewardedAt: string | null
  referrerId: number, referrerUsername: string, referrerStatus: PlayerStatus
  refereeId: number, refereeUsername: string, refereeStatus: PlayerStatus, refereeSaved: boolean, refereeRounds: number
}
export interface ReferralTotals { total: number, pending: number, rewarded: number, rejected: number, chipsPaid: number, referrers: number }

export interface Device {
  playerDeviceId: number, deviceId: string, platform: 'web' | 'ios' | 'android', deviceType: string | null
  deviceVendor: string | null, deviceModel: string | null, isVirtual: boolean, osName: string | null, osVersion: string | null
  browserName: string | null, browserVersion: string | null, appVersion: string | null
  screenWidth: number | null, screenHeight: number | null, pixelRatio: number | null
  language: string | null, timezone: string | null, visits: number, firstSeenAt: string, lastSeenAt: string
}

export interface Visit {
  playerVisitId: number, ip: string | null, country: string | null, region: string | null, city: string | null
  latitude: number | null, longitude: number | null, networkType: string | null, networkQuality: string | null
  orientation: string | null, createdAt: string, platform: string, deviceModel: string | null, osName: string | null, browserName: string | null
}

export const TRANSACTION_TYPES = ['SIGNUP_BONUS', 'DAILY_BONUS', 'REFILL_BONUS', 'PROMO_BONUS', 'REFERRAL_BONUS', 'ACHIEVEMENT_BONUS', 'BET', 'WIN', 'REFUND', 'ADMIN_ADJUST'] as const
export interface Transaction {
  walletTransactionId: number, playerId: number, username: string, type: string, direction: 'CREDIT' | 'DEBIT'
  amount: number, balanceBefore: number, balanceAfter: number, referenceType: string | null, referenceId: string | null
  metadata: Record<string, unknown>, createdAt: string
}

export interface Bonus {
  bonusId: number, code: string, type: string, amount: number, cooldownSeconds: number | null, maxClaims: number | null
  minBalanceThreshold: number | null, isActive: boolean, updatedAt: string, claims: number, totalPaid: number, claimsToday: number
}

export interface Room {
  roomId: number, code: string, variant: string, mode: string, status: string, maxSeats: number, minBet: number, maxBet: number
  totalRounds: number | null, createdAt: string, hostUsername: string | null, rounds: number, lastRoundAt: string | null, staked: number
  seated: Array<{ playerId: number | null, username: string, isBot: boolean, seat: number, away: boolean }>
}

export interface ChatReport {
  chatMessageId: number, text: string, sentAt: string, playerId: number, username: string, playerStatus: PlayerStatus
  roomId: number, roomCode: string, reports: number, lastReportedAt: string, reporters: string[]
}

export interface AuditLog {
  adminAuditLogId: number, action: string, targetType: string | null, targetId: string | null
  details: Record<string, unknown>, createdAt: string, adminEmail: string, adminName: string
}

export type AnnouncementAudience = 'ALL' | 'INACTIVE' | 'PLAYER'
export interface AnnouncementInput { title: string, body: string, audience: AnnouncementAudience, days?: number, playerId?: number, requestId: string }
export interface AnnouncementReach {
  players: number, phones: number
  /** For one player who can't be reached: why. */
  unreachable: string | null
  configured: { android: boolean, ios: boolean }
}
export interface Announcement {
  announcementId: number, title: string, body: string, audience: AnnouncementAudience, audienceDays: number | null, audiencePlayerId: number | null
  status: 'SENDING' | 'SENT' | 'FAILED', targeted: number, sent: number, skipped: Record<string, number>, error: string | null
  createdAt: string, finishedAt: string | null, adminName: string, adminEmail: string, stalled: boolean
}

/** One id per form, so a double-click sends once. */
export const newRequestId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')
export const ANNOUNCEMENT_LIMITS = { title: 65, body: 178 } as const
