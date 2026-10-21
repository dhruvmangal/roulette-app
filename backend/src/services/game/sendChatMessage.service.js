import ajv from '~/libs/ajv'
import redisClient from '~/libs/redisClient'
import ServiceBase from '~/services/serviceBase'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { cleanChatText, toChatView } from '~/utils/chat.utils'
import { CHAT_KINDS, CHAT_RATE_MAX, CHAT_RATE_WINDOW_SECONDS, CHAT_REACTIONS, ROOM_STATUS } from '~/utils/constants/game.constants'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    roomId: { type: 'integer', minimum: 1 },
    // Generous before cleaning; the stored text is capped at CHAT_MAX_LENGTH.
    text: { type: 'string', minLength: 1, maxLength: 1000 },
    // A quick reaction instead of typed text.
    reaction: { type: 'string', enum: CHAT_REACTIONS }
  },
  required: ['playerId', 'roomId'],
  anyOf: [{ required: ['text'] }, { required: ['reaction'] }]
})

/** Posts a message or quick reaction to an online table's chat. Only players seated at the table can. */
export class SendChatMessageService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, roomId, reaction } = this.args
    const { dbModels: { ChatMessage, Player, Room, RoomPlayer } } = this.context

    const clean = reaction ?? cleanChatText(this.args.text)
    if (!clean) return this.addError('RequestInputValidationErrorType', 'the message is empty')

    const [room, seat] = await Promise.all([
      Room.findByPk(roomId),
      RoomPlayer.findOne({ where: { roomId, playerId, leftAt: null } })
    ])
    if (!room) return this.addError('RoomNotFoundErrorType', `${roomId}`)
    if (room.status === ROOM_STATUS.ENDED) return this.addError('RoomEndedErrorType', room.code)
    if (!seat) return this.addError('NotSeatedErrorType', `room ${roomId}`)

    // A fixed window per player, shared by every server through Redis.
    const key = `roulette:chatRate:${playerId}`
    const sent = await redisClient.client.incr(key)
    if (sent === 1) await redisClient.client.expire(key, CHAT_RATE_WINDOW_SECONDS)
    if (sent > CHAT_RATE_MAX) return this.addError('ChatRateLimitedErrorType', `(at most ${CHAT_RATE_MAX} every ${CHAT_RATE_WINDOW_SECONDS}s)`)

    const player = await Player.findByPk(playerId)
    const message = await ChatMessage.create({ roomId, roomPlayerId: seat.roomPlayerId, playerId, text: clean, kind: reaction ? CHAT_KINDS.REACTION : CHAT_KINDS.TEXT })
    const view = toChatView(message, seat.seat, player.username)
    RouletteEmitter.chatMessage(roomId, view)
    return { message: view }
  }
}
