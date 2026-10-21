export const VARIANTS = ['AMERICAN', 'ENGLISH']

export const ROOM_MODES = {
  VS_COMPUTER: 'VS_COMPUTER',
  PRIVATE: 'PRIVATE',
  PUBLIC: 'PUBLIC'
}

export const ROOM_STATUS = {
  // Private tables: seated players wait here until the host starts the game.
  WAITING: 'WAITING',
  OPEN: 'OPEN',
  ENDED: 'ENDED'
}

export const ROUND_STATUS = {
  BETTING: 'BETTING',
  BETS_CLOSED: 'BETS_CLOSED',
  SPINNING: 'SPINNING',
  // Payouts are done; the result is on show until phase_ends_at.
  SETTLED: 'SETTLED',
  // Abandoned (the room ended mid-round); every bet was refunded.
  CANCELLED: 'CANCELLED'
}

export const BET_STATUS = {
  PLACED: 'PLACED',
  WON: 'WON',
  LOST: 'LOST',
  REFUNDED: 'REFUNDED'
}

export const MAX_SEATS = 8

export const ROOM_DEFAULTS = {
  bettingSeconds: 20,
  minBet: 1,
  maxBet: 5000,
  vsComputerBots: 3
}

export const ROOM_LIMITS = {
  bettingSeconds: { min: 10, max: 60 },
  totalRounds: { min: 1, max: 100 },
  minBet: { min: 1, max: 1000 },
  maxBet: { min: 1, max: 1000000 },
  bots: { min: 0, max: MAX_SEATS - 1 }
}

// How long each phase after betting lasts. SPINNING covers the client's
// 13-second wheel animation.
export const PHASE_MS = {
  BETS_CLOSED: 1000,
  SPINNING: 14000,
  RESULT: 6000
}

export const BOT_START_BALANCE = 1000
export const BOT_NAMES = ['Marcel', 'Ines', 'Viktor', 'Sofia', 'Kenji', 'Amara', 'Lucien']

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6
export const HISTORY_LENGTH = 20

// The room runner's Redis lock, renewed on every step. If a node dies, its
// rooms are picked up by another node's sweep once the lock expires.
export const RUNNER_LOCK_TTL_MS = 30000
export const RUNNER_SWEEP_INTERVAL_MS = 5000
export const ROOM_WAKE_CHANNEL = 'roulette:roomWake'
// An idle room is not woken by the sweep again for this long; a player
// returning wakes it at once through ROOM_WAKE_CHANNEL.
export const IDLE_RECHECK_MS = 60000
// How often absent players' seats are checked, and the lock that makes one
// server do it.
export const AWAY_CHECK_INTERVAL_MS = 60000
export const AWAY_CHECK_LOCK = 'roulette:awayCheck'

// Table chat (online rooms only).
export const CHAT_MAX_LENGTH = 200
export const CHAT_HISTORY = 30
export const CHAT_KINDS = { TEXT: 'TEXT', REACTION: 'REACTION', BETS: 'BETS', RESULT: 'RESULT' }
// Quick reactions: clients draw the icon for an id, so the set can change
// without rewriting history. Keep in step with REACTIONS in @roulette/contracts.
export const CHAT_REACTIONS = ['sorrow', 'frustration', 'emptyPocket', 'win', 'jackpot', 'fire', 'luck', 'nervous']
// At most CHAT_RATE_MAX messages per player in any CHAT_RATE_WINDOW_SECONDS.
export const CHAT_RATE_MAX = 5
export const CHAT_RATE_WINDOW_SECONDS = 10
// Masked in chat. A starting point: a real launch should add a maintained
// moderation list or service.
export const CHAT_BLOCKED_WORDS = [
  'fuck', 'shit', 'cunt', 'bitch', 'bastard', 'asshole', 'dickhead', 'motherfucker', 'wanker', 'twat',
  'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retard', 'spastic', 'kike', 'chink', 'paki'
]
