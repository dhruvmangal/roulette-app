import ajv from '~/libs/ajv'
import redisClient from '~/libs/redisClient'
import ServiceBase from '~/services/serviceBase'
import { ROOM_MODES, VARIANTS } from '~/utils/constants/game.constants'
import { CreateRoomService } from './createRoom.service'
import { JoinRoomService } from './joinRoom.service'
import { LeaveRoomService } from './leaveRoom.service'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    // Discord's id for this running Activity: the same for everyone in the call.
    instanceId: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,128}$' },
    variant: { enum: VARIANTS }
  },
  required: ['playerId', 'instanceId']
})

const KEY = (instanceId) => `roulette:discord:instance:${instanceId}`
// Long enough for a night of play; an ended table is replaced anyway.
const TTL_SECONDS = 24 * 60 * 60

/**
 * Seats a player at the private table for their Discord Activity, opening it
 * if they are the first. Everyone in the voice call has the same instance id,
 * so they all land at one table, and the first player is its host.
 */
export class JoinDiscordTableService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, instanceId, variant = VARIANTS[0] } = this.args
    const { client } = redisClient
    const key = KEY(instanceId)

    const existing = await client.get(key)
    if (existing) {
      const joined = await JoinRoomService.execute({ playerId, code: existing }, this.context)
      if (joined.successful) return joined.result
      // The table is gone (ended): fall through and open a new one.
      if (!('RoomNotFoundErrorType' in (joined.errors.JoinRoomService || {})) && !('RoomEndedErrorType' in (joined.errors.JoinRoomService || {}))) {
        return this.mergeErrors(joined.errors)
      }
      await client.del(key)
    }

    const created = await CreateRoomService.execute({ playerId, variant, mode: ROOM_MODES.PRIVATE, bots: 0 }, this.context)
    if (!created.successful) return this.mergeErrors(created.errors)
    const { room } = created.result

    // Two players opening the Activity at once both create a table; the first to record theirs wins.
    const won = await client.set(key, room.code, 'EX', TTL_SECONDS, 'NX')
    if (won) return created.result

    const winner = await client.get(key)
    await LeaveRoomService.execute({ roomId: room.roomId, playerId }, this.context)
    const joined = await JoinRoomService.execute({ playerId, code: winner }, this.context)
    if (!joined.successful) return this.mergeErrors(joined.errors)
    return joined.result
  }
}
