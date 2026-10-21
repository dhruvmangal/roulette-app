import { Op } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { BET_STATUS, CHAT_HISTORY, HISTORY_LENGTH, ROUND_STATUS } from '~/utils/constants/game.constants'
import { toChatView } from '~/utils/chat.utils'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { toBetView, toRoomView, toRoundView, toSeatView } from '~/utils/game.utils'
import { toWalletView } from '~/utils/player.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    roomId: { type: 'integer', minimum: 1 },
    playerId: { type: 'integer', minimum: 1 },
    // Refuse unless playerId is seated at the table.
    requireSeat: { type: 'boolean' }
  },
  required: ['roomId']
})

/**
 * Everything a client needs to draw a table from scratch (on join or
 * reconnect): the room, who is seated, the current round and its bets, and
 * recent results.
 */
export class GetRoomStateService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { roomId, playerId, requireSeat = false } = this.args
    const { dbModels: { Bet, ChatMessage, Player, Room, RoomPlayer, Round, Wallet } } = this.context

    const room = await Room.findByPk(roomId)
    if (!room) return this.addError('RoomNotFoundErrorType', `${roomId}`)

    const [seats, round, settled, chat] = await Promise.all([
      RoomPlayer.findAll({ where: { roomId, leftAt: null }, include: [{ model: Player, required: false }], order: [['seat', 'ASC']] }),
      Round.findOne({ where: { roomId }, order: [['roundNumber', 'DESC']] }),
      Round.findAll({
        where: { roomId, status: ROUND_STATUS.SETTLED },
        attributes: ['winningPocket'],
        order: [['roundNumber', 'DESC']],
        limit: HISTORY_LENGTH
      }),
      ChatMessage.findAll({
        where: { roomId },
        include: [{ model: RoomPlayer, attributes: ['seat'] }, { model: Player, attributes: ['username'] }],
        order: [['chatMessageId', 'DESC']],
        limit: CHAT_HISTORY
      })
    ])

    const seatNumbers = new Map(seats.map(seat => [seat.roomPlayerId, seat.seat]))
    const bets = round
      ? await Bet.findAll({ where: { roundId: round.roundId, status: { [Op.ne]: BET_STATUS.REFUNDED } }, order: [['betId', 'ASC']] })
      : []
    const me = seats.find(seat => playerId && seat.playerId === playerId)
    if (requireSeat && !me) return this.addError('NotSeatedErrorType', `room ${roomId}`)
    // A seated player's own wallet, so their seat can show their balance.
    const wallet = me ? await Wallet.findOne({ where: { playerId } }) : null

    return {
      room: toRoomView(room),
      seats: seats.map(seat => toSeatView(seat, seat.Player)),
      round: toRoundView(round),
      bets: bets.map(bet => toBetView(bet, seatNumbers.get(bet.roomPlayerId) ?? null)),
      history: settled.map(past => past.winningPocket),
      // Oldest first, as a chat reads.
      chat: chat.reverse().map(message => toChatView(message, message.RoomPlayer?.seat ?? null, message.Player?.username ?? 'Player')),
      me: me ? { roomPlayerId: me.roomPlayerId, seat: me.seat } : null,
      wallet: wallet ? toWalletView(wallet) : null,
      serverTime: new Date(),
      message: SUCCESS_MSG.GET_SUCCESS
    }
  }
}
