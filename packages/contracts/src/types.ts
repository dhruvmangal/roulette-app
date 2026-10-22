import type { ArcadeRisk, Bet, BetType, BotStyle, CrashBet, CrashGame, HorseBet, Pocket, VariantName } from '@roulette/engine'

export type { CrashBet }

/** Every REST response and socket ack: `data` on success, `errors` otherwise. */
export interface Envelope<T> {
  data: T
  errors: ApiErrorDetail[]
}

export interface ApiErrorDetail {
  name: string
  description: string
  errorCode?: number
  details?: string
}

// ── Players and auth ────────────────────────────────────────────────

export type IdentityProvider = 'google' | 'apple' | 'discord'

/** The providers that sign in with an ID token (Discord signs in with a login code instead). */
export type TokenProvider = Exclude<IdentityProvider, 'discord'>

export interface PlayerProfile {
  playerId: number
  username: string
  /** A provider-verified email from a linked account, if any. */
  email: string | null
  /** Linked Google/Apple accounts; empty for a guest. */
  providers: IdentityProvider[]
  isGuest: boolean
  status: 'active' | 'banned' | 'inactive'
  avatar: string | null
  country: string | null
  lastLoginAt: string | null
  createdAt: string
}

export interface Tokens {
  accessToken: string
  refreshToken: string
}

export interface Wallet {
  walletId: number
  balance: number
  lockedBalance: number
  currency: 'CHIP'
  version: number
}

export interface AuthResult {
  player: PlayerProfile
  wallet?: Wallet
  tokens: Tokens
  /** True when this sign-in created the player. */
  isNew?: boolean
}

/** The sign-in buttons the server has turned on, with each one's public client ID. */
export interface AuthProviders {
  google: { clientId: string } | null
  apple: { clientId: string } | null
  /** Set when the game can run as a Discord Activity. */
  discord: { clientId: string } | null
}

/** What the app got from Google or Apple's sign-in. */
export interface ProviderToken {
  idToken: string
  /** The raw nonce the app sent to the provider (Apple is sent its SHA-256). */
  nonce?: string
  /** Apple gives the player's name to the app only on the first sign-in. */
  name?: string
}

export type WalletTransactionType =
  | 'SIGNUP_BONUS' | 'DAILY_BONUS' | 'REFILL_BONUS' | 'PROMO_BONUS' | 'REFERRAL_BONUS' | 'ACHIEVEMENT_BONUS' | 'BET' | 'WIN' | 'REFUND' | 'ADMIN_ADJUST'

export interface WalletTransaction {
  walletTransactionId: number
  type: WalletTransactionType
  direction: 'CREDIT' | 'DEBIT'
  amount: number
  balanceBefore: number
  balanceAfter: number
  referenceType: 'ROUND' | 'BET' | 'BONUS' | 'ADMIN' | 'ARCADE' | null
  referenceId: string | null
  createdAt: string
}

export interface BonusOffer {
  code: string
  type: 'DAILY' | 'REFILL' | 'PROMO'
  claims: number
  claimable: boolean
  amount: number
  streakDay: number | null
  reason: string | null
  nextAvailableAt: string | null
}

// ── Devices ─────────────────────────────────────────────────────────

/** What the app tells the server about where it runs (POST /players/me/devices). */
export interface DeviceReport {
  /** A random id made once per install. */
  deviceId: string
  platform: 'web' | 'ios' | 'android'
  /** Only the iOS and Android apps can tell these. */
  native?: { manufacturer?: string, model?: string, osVersion?: string, isVirtual?: boolean }
  appVersion?: string
  screenWidth?: number
  screenHeight?: number
  pixelRatio?: number
  language?: string
  timezone?: string
  /** e.g. portrait-primary, landscape-secondary */
  orientation?: string
  /** wifi, cellular, ethernet, none, unknown */
  networkType?: string
  /** The browser's estimate: slow-2g, 2g, 3g or 4g. */
  networkQuality?: string
}

// ── Rooms ───────────────────────────────────────────────────────────

export type RoomMode = 'VS_COMPUTER' | 'PRIVATE' | 'PUBLIC'
export type RoundStatus = 'BETTING' | 'BETS_CLOSED' | 'SPINNING' | 'SETTLED' | 'CANCELLED'

export interface RoomView {
  roomId: number
  code: string
  variant: VariantName
  mode: RoomMode
  /** WAITING: a private table's lobby, before its host starts the game. */
  status: 'WAITING' | 'OPEN' | 'ENDED'
  maxSeats: number
  totalRounds: number | null
  minBet: number
  maxBet: number
  bettingSeconds: number
  hostPlayerId: number | null
}

export interface SeatView {
  roomPlayerId: number
  seat: number
  isBot: boolean
  playerId: number | null
  name: string
  botStyle: BotStyle | null
  /** Bots' play chips; null for real players, whose wallets are private. */
  botBalance: number | null
}

export interface RoundView {
  roundId: number
  roundNumber: number
  status: RoundStatus
  phaseEndsAt: string
  /** Null until the wheel is spun. */
  winningPocket: Pocket | null
}

export type BetView = Bet & {
  betId: number
  roomPlayerId: number
  seat: number | null
  status: 'PLACED' | 'WON' | 'LOST' | 'REFUNDED'
  payout: number | null
}

/** A table chat message (already cleaned and filtered by the server). */
export interface ChatMessage {
  chatMessageId: number
  roomPlayerId: number
  seat: number | null
  name: string
  /** Typed text; for a reaction, the reaction id. */
  text: string
  sentAt: string
  /** Absent on messages from before kinds existed: those are TEXT. */
  kind?: ChatKind
  data?: ChatBetsData | ChatResultData | null
}

/** TEXT is typed by a player, REACTION is a quick reaction; BETS and RESULT are lines the table writes about a player. */
export type ChatKind = 'TEXT' | 'REACTION' | 'BETS' | 'RESULT'

/** What a player put down for the round, as one line: the same bets are merged. */
export interface ChatBetsData {
  total: number
  bets: Array<{ type: string, pockets?: string[], index?: number, amount: number }>
}

/** How a player's round came out. `jackpot` is a winning straight-up bet. */
export interface ChatResultData {
  roundNumber: number
  pocket: string
  staked: number
  returned: number
  jackpot: boolean
}

export interface RoomState {
  room: RoomView
  seats: SeatView[]
  round: RoundView | null
  bets: BetView[]
  /** Winning pockets, newest first. */
  history: Pocket[]
  me: { roomPlayerId: number, seat: number } | null
  wallet: Wallet | null
  /** The latest messages, oldest first. */
  chat: ChatMessage[]
  serverTime: string
}

export interface PublicRoom {
  roomId: number
  code: string
  variant: VariantName
  maxSeats: number
  minBet: number
  maxBet: number
  bettingSeconds: number
  players: number
  seatsTaken: number
}

export interface CreateRoomInput {
  variant: VariantName
  mode: 'VS_COMPUTER' | 'PRIVATE'
  bots?: number
  totalRounds?: number | null
  bettingSeconds?: number
  minBet?: number
  maxBet?: number
}

export interface SessionSummaryRow {
  roomPlayerId: number
  seat: number
  playerId: number | null
  isBot: boolean
  name: string
  roundsPlayed: number
  staked: number
  returned: number
  net: number
  biggestWin: number
}

export interface HistoryRound {
  roundId: number
  roundNumber: number
  winningPocket: Pocket
  resultAt: string
  roomId: number
  code: string
  variant: VariantName
  mode: RoomMode
  bets: number
  staked: number
  returned: number
  net: number
}

/** A table the player still has a seat at. */
export interface MyTable {
  roomId: number
  code: string
  variant: VariantName
  mode: RoomMode
  seat: number
  joinedAt: string
  players: number
  bots: number
}

export type LeaderboardPeriod = 'day' | 'week' | 'all'

export interface LeaderboardEntry {
  rank: number
  playerId: number
  username: string
  net: number
  rounds: number
  biggestWin: number
}

export interface Leaderboard {
  period: LeaderboardPeriod
  /** The top 50. */
  entries: LeaderboardEntry[]
  /** The asking player's own row, wherever they rank; null if they have not played. */
  me: LeaderboardEntry | null
}

export type ReferralStatus = 'PENDING' | 'REWARDED' | 'REJECTED'

/** How far a referred friend (or the player themselves) is toward the referral reward. */
export interface ReferralProgress {
  status: ReferralStatus
  /** Signed in with Google or Apple, not a guest. */
  savedAccount: boolean
  /** Online rounds played, capped at the number required. */
  roundsPlayed: number
  /** Chips this side was paid; 0 until rewarded. */
  reward: number
}

/** The player's Refer & earn page. */
export interface ReferralPage {
  code: string
  rules: { referrerReward: number, friendReward: number, roundsRequired: number, maxRewarded: number, claimWindowDays: number }
  totals: { joined: number, pending: number, rewarded: number, chipsEarned: number }
  /** Newest first, up to 50. */
  friends: Array<ReferralProgress & { username: string, joinedAt: string }>
  /** Who referred this player, if anyone. */
  referredBy: (ReferralProgress & { username: string }) | null
  /** Whether the player may still enter a friend's code, and until when. */
  canEnterCode: boolean
  enterCodeUntil: string
}

export type StatsPeriod = 'week' | 'month' | 'all'

/** How the player bets at online tables over a period. Offline practice isn't recorded. */
export interface PlayerStats {
  period: StatsPeriod
  /** The IANA timezone days and hours are counted in. */
  timeZone: string
  summary: {
    rounds: number
    roundsWon: number
    roundsLost: number
    bets: number
    tables: number
    staked: number
    net: number
    /** Chips back per chip staked (stake included); null before any bet. */
    returnRate: number | null
    averageStake: number
    biggestWin: number
    biggestLoss: number
    /** Share of chips staked on inside bets (straight, split, street, corner, lines). */
    insideShare: number | null
    /** What the house edge predicts the player would be at after these stakes (always ≤ 0). */
    expectedNet: number
    firstPlayedAt: string | null
    lastPlayedAt: string | null
  }
  /** Most-staked first. */
  betTypes: Array<{ betType: BetType, bets: number, wins: number, staked: number, returned: number, net: number }>
  daily: Array<{ day: string, rounds: number, staked: number, net: number }>
  /** Rounds played in each hour 0–23 of the day. */
  roundsByHour: number[]
  /** The pockets most often backed with a straight bet. */
  favouriteNumbers: Array<{ pocket: Pocket, bets: number, hits: number, staked: number }>
  streaks: { longestWin: number, longestLoss: number, current: { kind: 'WIN' | 'LOSS', length: number } | null }
  /** The stretch of the same length just before this one (a week before a week); null for all time or no play then. */
  previous: { rounds: number, roundsWon: number, staked: number, net: number, returnRate: number | null } | null
  /** What the same stakes would have made on the very same spins, placed another way. */
  whatIf: Array<{ what: 'ALWAYS_RED' | 'RED_AND_BLACK' | 'FIRST_DOZEN', net: number }>
  /** How the player compares with others over the same stretch; null until there is anyone to compare with. */
  community: {
    /** Players with enough rounds to count, the player included. */
    players: number
    minRounds: number
    /** The share of the other players this one did better than, 0 to 1. */
    netBeaten: number | null
    returnBeaten: number | null
    medianNet: number
    medianRounds: number
    medianStake: number
  } | null
}

// ── Friends ─────────────────────────────────────────────────────────

export interface FriendPerson {
  playerId: number
  username: string
}

/** The table a friend is sitting at (shown only while they are connected). */
export interface FriendTable {
  code: string
  variant: VariantName
  mode: RoomMode
  seated: number
  maxSeats: number
  hasRoom: boolean
}

export interface Friend extends FriendPerson {
  since: string
  lastSeenAt: string | null
  online: boolean
  table: FriendTable | null
}

export interface FriendRequestRow extends FriendPerson {
  friendshipId: number
  sentAt: string
}

export interface FriendsList {
  /** Online friends first. */
  friends: Friend[]
  /** Waiting for the player's answer. */
  incoming: FriendRequestRow[]
  /** Sent by the player, not answered yet. */
  outgoing: FriendRequestRow[]
}

export interface FriendRequestResult {
  /** ACCEPTED when the other player had already asked. */
  status: 'PENDING' | 'ACCEPTED'
  friendshipId: number | null
  friend: FriendPerson
}

/** friend:request and friend:accepted. */
export interface FriendEventPayload {
  from: FriendPerson
}

/** friend:invited. */
export interface FriendInvitedPayload {
  from: FriendPerson
  code: string
  variant: VariantName
  mode: RoomMode
}

// ── Links ───────────────────────────────────────────────────────────

/** An invite or referral link, from any way it reaches the app. */
export interface DeferredLink {
  kind: 'join' | 'ref'
  code: string
}

// ── Achievements ────────────────────────────────────────────────────

/** Titles and descriptions are the apps' own words, by code, so they can be translated. */
export interface Achievement {
  code: string
  group: 'play' | 'hosted' | 'friends' | 'referrals' | 'daily'
  /** What it takes: rounds played, friends made, and so on, depending on the achievement. */
  target: number
  /** Chips paid when earned. */
  reward: number
  /** How far along, up to the target; full once earned. */
  progress: number
  unlockedAt: string | null
}

export interface AchievementsPage {
  achievements: Achievement[]
  totals: { unlocked: number, total: number, chipsEarned: number }
}

/** achievement:unlocked. */
export interface AchievementUnlockedPayload {
  code: string
  reward: number
}

// ── Notifications ───────────────────────────────────────────────────

export type NotificationCategory = 'dailyBonus' | 'friends' | 'achievements' | 'referrals' | 'announcements'

export interface NotificationSettings {
  prefs: Record<NotificationCategory, boolean>
  /** Phones set up to receive push notifications for this player. */
  devices: number
}

export interface RegisterPushTokenInput {
  token: string
  platform: 'android' | 'ios'
  deviceId?: string
  appVersion?: string
  language?: string
}

// ── Socket payloads ─────────────────────────────────────────────────

export interface PlaceBetsRequest {
  roomId: number
  bets: Bet[]
  /** Reuse the same id when retrying, so a bet is never placed twice. */
  requestId?: string
}

export interface PlaceBetsResult {
  bets: BetView[]
  wallet: Wallet | null
  replayed: boolean
}

export interface WithdrawBetsResult {
  betIds: number[]
  wallet: Wallet
}

export interface RoundResultSeat {
  roomPlayerId: number
  seat: number
  playerId: number | null
  staked: number
  returned: number
  net: number
}

/** What each server event carries in `data`. */
export interface ServerEventData {
  'round:phase': { roomId: number, round: RoundView, serverTime: string }
  'round:tick': { roomId: number, roundId: number, secondsLeft: number }
  'round:result': { roomId: number, roundId: number, roundNumber: number, pocket: Pocket, seats: RoundResultSeat[] }
  'bet:accepted': { roomId: number, bets: BetView[] }
  'bet:removed': { roomId: number, betIds: number[] }
  'wallet:updated': { wallet: Wallet }
  'room:state': RoomState
  'room:playerJoined': { roomId: number, seat: SeatView }
  'room:playerLeft': { roomId: number, seat: { roomPlayerId: number, seat: number } }
  'room:ended': { roomId: number, summary: SessionSummaryRow[] }
  'chat:message': { roomId: number, message: ChatMessage }
  'room:updated': { roomId: number, room: RoomView }
}

// ─── Arcade ──────────────────────────────────────────────────────────

interface ArcadeRoundBase {
  arcadeRoundId: number
  status: 'ACTIVE' | 'SETTLED'
  /** Chips staked in all, and chips paid back (0 until it settles). */
  stake: number
  payout: number
  startedAt: string
  settledAt: string | null
}

export interface PlinkoRound extends ArcadeRoundBase {
  game: 'PLINKO'
  outcome: { rows: number, risk: ArcadeRisk, path: number[], slot: number, multiplier: number }
}

export interface WheelRound extends ArcadeRoundBase {
  game: 'WHEEL'
  outcome: { risk: ArcadeRisk, segment: number, multiplier: number }
}

export interface HorsesRound extends ArcadeRoundBase {
  game: 'HORSES'
  outcome: { bets: HorseBet[], order: number[], seed: number, winner: number, odds: number[] }
}

export interface CrashRound extends ArcadeRoundBase {
  game: CrashGame
  outcome: {
    /** Told only once the flight is over. */
    crashPoint?: number
    bets: CrashBet[]
  }
  /** How far into the flight the server says it is; only for a flight in the air. */
  elapsedMs?: number
}

export type ArcadeRound = PlinkoRound | WheelRound | HorsesRound | CrashRound

/** A play and the balance after it. */
export interface ArcadePlay<R extends ArcadeRound = ArcadeRound> {
  round: R
  balance: number
}
