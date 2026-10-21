import { randomUUID } from 'crypto'
import { validateBet } from '@roulette/engine'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { ApplyWalletTransactionService } from '~/services/wallet'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { BET_STATUS, ROUND_STATUS } from '~/utils/constants/game.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { WALLET_DIRECTIONS, WALLET_REFERENCE_TYPES, WALLET_TRANSACTION_TYPES } from '~/utils/constants/wallet.constants'
import { fromEngineBet, toBetView } from '~/utils/game.utils'
import { inTransaction, withTransaction } from '~/utils/transaction.utils'

const MAX_BETS_PER_REQUEST = 50

export const betSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', maxLength: 16 },
    pockets: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 2 } },
    index: { type: 'integer' },
    amount: { type: 'integer', minimum: 1 }
  },
  required: ['type', 'amount']
}

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    roomId: { type: 'integer', minimum: 1 },
    bets: { type: 'array', minItems: 1, maxItems: MAX_BETS_PER_REQUEST, items: betSchema },
    requestId: { type: 'string', minLength: 1, maxLength: 64 }
  },
  required: ['playerId', 'roomId', 'bets']
})

/**
 * Places a player's bets, all or none, paying for each from their wallet.
 *
 * The round row is held with a shared lock, and closing betting needs an
 * exclusive one, so a bet is either fully placed before betting closes or
 * refused. A repeated requestId returns the bets it already placed.
 */
export class PlaceBetsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, roomId, bets, requestId = randomUUID() } = this.args
    const { dbModels: { Bet, Room, RoomPlayer, Round } } = this.context

    const placed = await withTransaction(this, async (transaction) => {
      const seat = await RoomPlayer.findOne({ where: { roomId, playerId, leftAt: null }, transaction })
      if (!seat) return this.addError('NotSeatedErrorType', `room ${roomId}`)
      const room = await Room.findByPk(roomId, { transaction })

      const round = await Round.findOne({ where: { roomId, status: ROUND_STATUS.BETTING }, lock: transaction.LOCK.SHARE, transaction })
      if (!round || new Date() >= round.phaseEndsAt) return this.addError('BettingClosedErrorType', `room ${roomId}`)

      const replay = await Bet.findAll({ where: { roundId: round.roundId, roomPlayerId: seat.roomPlayerId, requestId }, order: [['betId', 'ASC']], transaction })
      if (replay.length) return { seat, bets: replay, replayed: true }

      const accepted = []
      for (const input of bets) {
        const checked = validateBet(room.variant, input)
        if (!checked.ok) return this.addError('InvalidBetErrorType', `(${checked.error})`)
        if (checked.bet.amount < room.minBet) return this.addError('BetLimitErrorType', `(the smallest bet is ${room.minBet})`)
        accepted.push(checked.bet)
      }
      const alreadyStaked = Number(await Bet.sum('amount', { where: { roundId: round.roundId, roomPlayerId: seat.roomPlayerId, status: BET_STATUS.PLACED }, transaction })) || 0
      const total = accepted.reduce((sum, bet) => sum + bet.amount, 0)
      if (alreadyStaked + total > room.maxBet) {
        return this.addError('BetLimitErrorType', `(at most ${room.maxBet} per round; ${alreadyStaked} already on the table)`)
      }

      const rows = []
      let wallet
      for (const [i, bet] of accepted.entries()) {
        const paid = await ApplyWalletTransactionService.execute({
          playerId,
          amount: bet.amount,
          direction: WALLET_DIRECTIONS.DEBIT,
          type: WALLET_TRANSACTION_TYPES.BET,
          referenceType: WALLET_REFERENCE_TYPES.ROUND,
          referenceId: String(round.roundId),
          idempotencyKey: `bet:${round.roundId}:${playerId}:${requestId}:${i}`
        }, inTransaction(this.context, transaction))
        if (!paid.successful) return this.mergeErrors(paid.errors)
        wallet = paid.result.wallet
        rows.push(await Bet.create({
          roundId: round.roundId,
          roomPlayerId: seat.roomPlayerId,
          playerId,
          ...fromEngineBet(bet),
          requestId,
          debitTransactionId: paid.result.walletTransaction.walletTransactionId
        }, { transaction }))
      }
      return { seat, bets: rows, wallet, replayed: false }
    })
    if (!placed) return

    const views = placed.bets.map(bet => toBetView(bet, placed.seat.seat))
    if (!placed.replayed) {
      RouletteEmitter.betsAccepted(roomId, views)
      RouletteEmitter.walletUpdated(playerId, placed.wallet)
    }
    return { bets: views, wallet: placed.wallet ?? null, replayed: placed.replayed, message: SUCCESS_MSG.BETS_PLACED }
  }
}
