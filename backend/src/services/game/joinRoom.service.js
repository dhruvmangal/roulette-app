import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { ROOM_STATUS } from '~/utils/constants/game.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { toSeatView } from '~/utils/game.utils'
import { wakeRoom } from '~/utils/roomWake.utils'
import { withTransaction } from '~/utils/transaction.utils'
import { GetRoomStateService } from './getRoomState.service'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    code: { type: 'string', pattern: '^[A-Z0-9]{6}$' },
    roomId: { type: 'integer', minimum: 1 }
  },
  required: ['playerId'],
  anyOf: [{ required: ['code'] }, { required: ['roomId'] }]
})

/** Seats a player at a table (by code or id). Joining a table you sit at is a no-op. */
export class JoinRoomService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, code, roomId } = this.args
    const { dbModels: { Player, Room, RoomPlayer } } = this.context

    const joined = await withTransaction(this, async (transaction) => {
      // Locking the room makes seat assignment one join at a time.
      const room = await Room.findOne({ where: code ? { code } : { roomId }, lock: transaction.LOCK.UPDATE, transaction })
      if (!room) return this.addError('RoomNotFoundErrorType', `${code || roomId}`)
      if (room.status === ROOM_STATUS.ENDED) return this.addError('RoomEndedErrorType', `${room.code}`)

      const seats = await RoomPlayer.findAll({ where: { roomId: room.roomId, leftAt: null }, transaction })
      if (seats.some(seat => seat.playerId === playerId)) return { room, seat: null }

      const taken = new Set(seats.map(seat => seat.seat))
      let free = 1
      while (taken.has(free)) free++
      if (free > room.maxSeats) return this.addError('RoomFullErrorType', `${room.code}`)

      // Away until the player's socket arrives at the table (see SetPresenceService).
      const joinedAt = new Date()
      const seat = await RoomPlayer.create({ roomId: room.roomId, playerId, seat: free, joinedAt, awaySince: joinedAt }, { transaction })
      return { room, seat }
    })
    if (!joined) return

    if (joined.seat) {
      const player = await Player.findByPk(playerId)
      RouletteEmitter.playerJoined(joined.room.roomId, toSeatView(joined.seat, player))
      await wakeRoom(joined.room.roomId)
    }
    const state = await GetRoomStateService.execute({ roomId: joined.room.roomId, playerId }, this.context)
    if (!state.successful) return this.mergeErrors(state.errors)
    return { ...state.result, message: SUCCESS_MSG.ROOM_JOINED }
  }
}
