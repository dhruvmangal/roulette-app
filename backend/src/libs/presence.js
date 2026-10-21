import { SOCKET_NAMESPACES } from '~/utils/constants/socket'

const TTL_MS = 3000
let cache = { at: 0, ids: new Set() }

/**
 * The ids of players connected to the game right now, on any server. Asks the
 * socket servers once and reuses the answer for a few seconds, so a screen of
 * friends costs one lookup however many it shows. That is plenty at this
 * size; thousands of simultaneous players would want a presence set in Redis.
 */
export const onlinePlayerIds = async () => {
  if (Date.now() - cache.at < TTL_MS) return cache.ids
  // Loaded on first use: the socket server connects to Redis the moment it is imported.
  const { default: socketServer } = await import('~/socket-resources')
  const sockets = await socketServer.of(SOCKET_NAMESPACES.ROULETTE).fetchSockets()
  cache = { at: Date.now(), ids: new Set(sockets.map(socket => socket.data?.playerId).filter(Boolean)) }
  return cache.ids
}

export const isOnline = async (playerId) => (await onlinePlayerIds()).has(playerId)
