import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    roomId: { type: 'integer', minimum: 1 },
    share: { type: 'boolean' }
  },
  required: ['playerId', 'roomId', 'share']
})

/** Whether the table's chat may say what the player bet and won. Applies from the next line written. */
export class SetShareBetsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, roomId, share } = this.args
    const { dbModels: { RoomPlayer } } = this.context

    const seat = await RoomPlayer.findOne({ where: { roomId, playerId, leftAt: null } })
    if (!seat) return this.addError('NotSeatedErrorType', `room ${roomId}`)
    if (seat.shareBets !== share) await seat.update({ shareBets: share })
    return { share }
  }
}
