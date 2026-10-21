import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { BET_STATUS, ROOM_MODES, ROUND_STATUS } from '~/utils/constants/game.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { toRoomView } from '~/utils/game.utils'
import { inTransaction, withTransaction } from '~/utils/transaction.utils'
import { EndRoomService } from './endRoom.service'
import { RefundBetsService } from './refundBets.service'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    roomId: { type: 'integer', minimum: 1 }
  },
  required: ['playerId', 'roomId']
})

/**
 * Takes a player's seat away. Bets still open are refunded; bets on a wheel
 * already spinning stay and are paid out. A private or vs-computer table
 * closes when its last player leaves. If the host leaves, the longest-seated
 * player becomes host.
 */
export class LeaveRoomService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, roomId } = this.args
    const { dbModels: { Bet, Room, RoomPlayer, Round } } = this.context

    const left = await withTransaction(this, async (transaction) => {
      const room = await Room.findByPk(roomId, { lock: transaction.LOCK.UPDATE, transaction })
      if (!room) return this.addError('RoomNotFoundErrorType', `${roomId}`)
      const seat = await RoomPlayer.findOne({ where: { roomId, playerId, leftAt: null }, transaction })
      if (!seat) return this.addError('NotSeatedErrorType', `room ${roomId}`)

      let refunds = { betIds: [], wallets: {} }
      const betting = await Round.findOne({ where: { roomId, status: ROUND_STATUS.BETTING }, lock: transaction.LOCK.SHARE, transaction })
      if (betting) {
        const bets = await Bet.findAll({ where: { roundId: betting.roundId, roomPlayerId: seat.roomPlayerId, status: BET_STATUS.PLACED }, transaction })
        const refunded = await RefundBetsService.execute({ bets }, inTransaction(this.context, transaction))
        if (!refunded.successful) return this.mergeErrors(refunded.errors)
        refunds = refunded.result
      }

      await seat.update({ leftAt: new Date() }, { transaction })
      const humans = await RoomPlayer.findAll({ where: { roomId, leftAt: null, isBot: false }, order: [['joinedAt', 'ASC']], transaction })
      // The host's job (starting a waiting table) passes to whoever has sat there longest.
      let newHost = false
      if (room.hostPlayerId === playerId && humans.length) {
        await room.update({ hostPlayerId: humans[0].playerId }, { transaction })
        newHost = true
      }
      return { seat, refunds, room, newHost, closeRoom: humans.length === 0 && room.mode !== ROOM_MODES.PUBLIC }
    })
    if (!left) return

    if (left.refunds.betIds.length) RouletteEmitter.betsRemoved(roomId, left.refunds.betIds)
    if (left.refunds.wallets[playerId]) RouletteEmitter.walletUpdated(playerId, left.refunds.wallets[playerId])
    RouletteEmitter.playerLeft(roomId, { roomPlayerId: left.seat.roomPlayerId, seat: left.seat.seat })
    if (left.newHost) RouletteEmitter.roomUpdated(roomId, toRoomView(left.room))

    if (left.closeRoom) {
      const ended = await EndRoomService.execute({ roomId }, this.context)
      if (!ended.successful) return this.mergeErrors(ended.errors)
    }
    return { roomId, left: true, message: SUCCESS_MSG.ROOM_LEFT }
  }
}
