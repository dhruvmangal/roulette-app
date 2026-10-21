import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { ROOM_STATUS } from '~/utils/constants/game.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { toRoomView } from '~/utils/game.utils'
import { wakeRoom } from '~/utils/roomWake.utils'
import { withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    roomId: { type: 'integer', minimum: 1 }
  },
  required: ['playerId', 'roomId']
})

/**
 * The host ends a private table's lobby: the room opens and the first round
 * is dealt at once. Starting a table that already started is a no-op.
 */
export class StartRoomService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, roomId } = this.args
    const { dbModels: { Room } } = this.context

    const started = await withTransaction(this, async (transaction) => {
      const room = await Room.findByPk(roomId, { lock: transaction.LOCK.UPDATE, transaction })
      if (!room) return this.addError('RoomNotFoundErrorType', `${roomId}`)
      if (room.status === ROOM_STATUS.ENDED) return this.addError('RoomEndedErrorType', `${room.code}`)
      if (room.hostPlayerId !== playerId) return this.addError('NotRoomHostErrorType', `${room.code}`)
      if (room.status === ROOM_STATUS.OPEN) return { room, changed: false }

      await room.update({ status: ROOM_STATUS.OPEN }, { transaction })
      return { room, changed: true }
    })
    if (!started) return

    if (started.changed) {
      RouletteEmitter.roomUpdated(roomId, toRoomView(started.room))
      await wakeRoom(roomId)
    }
    return { room: toRoomView(started.room), message: SUCCESS_MSG.ROOM_STARTED }
  }
}
