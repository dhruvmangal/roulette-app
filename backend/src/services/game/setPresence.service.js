import { Op } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { wakeRoom } from '~/utils/roomWake.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    roomIds: { type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 20 },
    present: { type: 'boolean' }
  },
  required: ['playerId', 'roomIds', 'present']
})

/**
 * Records a player arriving at or leaving their tables. Arriving clears the
 * away mark and wakes the room, so a paused table deals again; leaving marks
 * the seat away, which starts the clock on giving it up.
 */
export class SetPresenceService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, roomIds, present } = this.args
    const { dbModels: { RoomPlayer } } = this.context
    if (!roomIds.length) return { updated: 0 }

    const [updated] = await RoomPlayer.update(
      { awaySince: present ? null : new Date() },
      { where: { playerId, roomId: { [Op.in]: roomIds }, leftAt: { [Op.is]: null }, ...(present ? {} : { awaySince: { [Op.is]: null } }) } }
    )
    if (present) await Promise.all(roomIds.map(wakeRoom))
    return { updated }
  }
}
