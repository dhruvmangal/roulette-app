import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { BET_STATUS, ROUND_STATUS } from '~/utils/constants/game.constants'
import { toEngineBet } from '~/utils/game.utils'
import { PlaceBetsService } from './placeBets.service'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    roomId: { type: 'integer', minimum: 1 },
    requestId: { type: 'string', minLength: 1, maxLength: 64 }
  },
  required: ['playerId', 'roomId']
})

/** Places again the bets the player had on the table's last settled round. */
export class RepeatLastBetsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, roomId, requestId } = this.args
    const { dbModels: { Bet, RoomPlayer, Round } } = this.context

    const seat = await RoomPlayer.findOne({ where: { roomId, playerId, leftAt: null } })
    if (!seat) return this.addError('NotSeatedErrorType', `room ${roomId}`)
    const last = await Round.findOne({ where: { roomId, status: ROUND_STATUS.SETTLED }, order: [['roundNumber', 'DESC']] })
    const previous = last
      ? await Bet.findAll({ where: { roundId: last.roundId, roomPlayerId: seat.roomPlayerId, status: [BET_STATUS.WON, BET_STATUS.LOST] }, order: [['betId', 'ASC']] })
      : []
    if (!previous.length) return this.addError('NoPreviousBetsErrorType', '')

    const placed = await PlaceBetsService.execute({ playerId, roomId, bets: previous.map(toEngineBet), requestId }, this.context)
    if (!placed.successful) return this.mergeErrors(placed.errors)
    return placed.result
  }
}
