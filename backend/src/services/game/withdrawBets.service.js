import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { BET_STATUS, ROUND_STATUS } from '~/utils/constants/game.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { inTransaction, withTransaction } from '~/utils/transaction.utils'
import { RefundBetsService } from './refundBets.service'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    roomId: { type: 'integer', minimum: 1 },
    // One bet to take back; without it, all of the player's bets this round.
    betId: { type: 'integer', minimum: 1 }
  },
  required: ['playerId', 'roomId']
})

/** Takes back one or all of a player's bets while betting is open. */
export class WithdrawBetsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, roomId, betId } = this.args
    const { dbModels: { Bet, RoomPlayer, Round } } = this.context

    const withdrawn = await withTransaction(this, async (transaction) => {
      const seat = await RoomPlayer.findOne({ where: { roomId, playerId, leftAt: null }, transaction })
      if (!seat) return this.addError('NotSeatedErrorType', `room ${roomId}`)
      const round = await Round.findOne({ where: { roomId, status: ROUND_STATUS.BETTING }, lock: transaction.LOCK.SHARE, transaction })
      if (!round || new Date() >= round.phaseEndsAt) return this.addError('BettingClosedErrorType', `room ${roomId}`)

      const where = { roundId: round.roundId, roomPlayerId: seat.roomPlayerId, status: BET_STATUS.PLACED }
      if (betId) where.betId = betId
      const bets = await Bet.findAll({ where, lock: transaction.LOCK.UPDATE, transaction })
      if (!bets.length) return this.addError('BetNotFoundErrorType', betId ? `${betId}` : 'on the table')

      const refunded = await RefundBetsService.execute({ bets }, inTransaction(this.context, transaction))
      if (!refunded.successful) return this.mergeErrors(refunded.errors)
      return refunded.result
    })
    if (!withdrawn) return

    RouletteEmitter.betsRemoved(roomId, withdrawn.betIds)
    RouletteEmitter.walletUpdated(playerId, withdrawn.wallets[playerId])
    return { betIds: withdrawn.betIds, wallet: withdrawn.wallets[playerId], message: SUCCESS_MSG.BETS_REMOVED }
  }
}
