/** Events a client sends on the /roulette namespace. */
export const CLIENT_EVENTS = {
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  BET_PLACE: 'bet:place',
  BET_REMOVE: 'bet:remove',
  BET_CLEAR: 'bet:clear',
  BET_REPEAT_LAST: 'bet:repeatLast',
  CHAT_SEND: 'chat:send',
  CHAT_REPORT: 'chat:report',
  /** Whether the table's chat may say what the player bet and won. */
  CHAT_SHARE_BETS: 'chat:shareBets',
  /** The host starts a waiting private table. */
  ROOM_START: 'room:start'
} as const

/** Events the server pushes on the /roulette namespace. */
export const SERVER_EVENTS = {
  ROUND_PHASE: 'round:phase',
  ROUND_TICK: 'round:tick',
  ROUND_RESULT: 'round:result',
  BET_ACCEPTED: 'bet:accepted',
  BET_REMOVED: 'bet:removed',
  WALLET_UPDATED: 'wallet:updated',
  ROOM_STATE: 'room:state',
  PLAYER_JOINED: 'room:playerJoined',
  PLAYER_LEFT: 'room:playerLeft',
  ROOM_ENDED: 'room:ended',
  CHAT_MESSAGE: 'chat:message',
  /** The room started, or has a new host. */
  ROOM_UPDATED: 'room:updated',
  /** Someone asked the player to be friends. */
  FRIEND_REQUEST: 'friend:request',
  /** A friend request the player sent was accepted. */
  FRIEND_ACCEPTED: 'friend:accepted',
  /** A friend invited the player to their table. */
  FRIEND_INVITED: 'friend:invited',
  /** The player just earned an achievement. */
  ACHIEVEMENT_UNLOCKED: 'achievement:unlocked'
} as const

export const ROULETTE_NAMESPACE = '/roulette'

/** Error codes clients branch on (the rest are shown as messages). */
export const ERROR_CODES = {
  RequestInvalid: 1001,
  SocketRequestInvalid: 1003,
  Unauthorized: 1007,
  InvalidToken: 1008,
  UsernameTaken: 1200,
  PlayerBanned: 1203,
  InvalidRefreshToken: 1205,
  InvalidIdentityToken: 1207,
  ProviderNotConfigured: 1208,
  IdentityInUse: 1209,
  InsufficientBalance: 1301,
  BonusNotAvailable: 1401,
  RoomNotFound: 1500,
  RoomFull: 1501,
  RoomEnded: 1502,
  NotSeated: 1503,
  NotRoomHost: 1505,
  BettingClosed: 1510,
  InvalidBet: 1511,
  BetLimit: 1512,
  BetNotFound: 1513,
  NoPreviousBets: 1514,
  ChatRateLimited: 1520,
  ChatMessageNotFound: 1521,
  ReferralCodeNotFound: 1700,
  ReferralNotAllowed: 1701,
  FriendRequestNotAllowed: 1710,
  FriendRequestNotFound: 1711,
  FriendNotFound: 1712,
  FriendInviteNotAllowed: 1713,
  PlayerNameNotFound: 1714,
  ArcadeRoundActive: 1800,
  ArcadeRoundNotFound: 1801,
  ArcadeBetLimit: 1802,
  ArcadeBadChoice: 1803,
  ArcadeAlreadyOver: 1804
} as const

/** Quick chat reactions; each client draws its own icon for an id. */
export const REACTIONS = ['sorrow', 'frustration', 'emptyPocket', 'win', 'jackpot', 'fire', 'luck', 'nervous'] as const
