import redisClient from '~/libs/redisClient'
import { ROOM_WAKE_CHANNEL } from '~/utils/constants/game.constants'

/**
 * Asks whichever server can take the room's runner lock to start running it,
 * e.g. after a player joins an idle table.
 */
export const wakeRoom = (roomId) => redisClient.publisherClient.publish(ROOM_WAKE_CHANNEL, String(roomId))
