// Namespace / room / emitter name registry.
// See coding-guide.md for naming conventions (kebab-case namespaces, camelCase channel/room names).
export const SOCKET_NAMESPACES = {
  DEMO: '/demo',
  ROULETTE: '/roulette'
}

export const SOCKET_ROOMS = {
  DEMO_ROOM: 'DEMO_ROOM',
  // Everyone watching a table: `room:<roomId>`.
  ROULETTE_TABLE: (roomId) => `room:${roomId}`,
  // One player's own events (their wallet) on any device: `player:<playerId>`.
  ROULETTE_PLAYER: (playerId) => `player:${playerId}`
}

export const SOCKET_EMITTERS = {
  DEMO_EVENT: 'DEMO_EVENT',
  ROULETTE_ROUND_PHASE: 'round:phase',
  ROULETTE_ROUND_TICK: 'round:tick',
  ROULETTE_ROUND_RESULT: 'round:result',
  ROULETTE_BET_ACCEPTED: 'bet:accepted',
  ROULETTE_BET_REMOVED: 'bet:removed',
  ROULETTE_WALLET_UPDATED: 'wallet:updated',
  ROULETTE_ROOM_STATE: 'room:state',
  ROULETTE_PLAYER_JOINED: 'room:playerJoined',
  ROULETTE_PLAYER_LEFT: 'room:playerLeft',
  ROULETTE_ROOM_ENDED: 'room:ended',
  ROULETTE_CHAT_MESSAGE: 'chat:message',
  ROULETTE_ROOM_UPDATED: 'room:updated',
  ROULETTE_FRIEND_REQUEST: 'friend:request',
  ROULETTE_FRIEND_ACCEPTED: 'friend:accepted',
  ROULETTE_FRIEND_INVITED: 'friend:invited',
  ROULETTE_ACHIEVEMENT_UNLOCKED: 'achievement:unlocked'
}

// Events clients send on the /roulette namespace.
export const ROULETTE_EVENTS = {
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  BET_PLACE: 'bet:place',
  BET_REMOVE: 'bet:remove',
  BET_CLEAR: 'bet:clear',
  BET_REPEAT_LAST: 'bet:repeatLast',
  CHAT_SEND: 'chat:send',
  CHAT_REPORT: 'chat:report',
  CHAT_SHARE_BETS: 'chat:shareBets',
  ROOM_START: 'room:start'
}
