import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    roomId: { type: 'integer', minimum: 1 },
    chatMessageId: { type: 'integer', minimum: 1 }
  },
  required: ['playerId', 'roomId', 'chatMessageId']
})

/**
 * Flags a chat message for review. The reporter must be (or have been) at the
 * table; reporting the same message again is harmless.
 */
export class ReportChatMessageService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, roomId, chatMessageId } = this.args
    const { dbModels: { ChatMessage, ChatReport, RoomPlayer } } = this.context

    const [message, seated] = await Promise.all([
      ChatMessage.findOne({ where: { chatMessageId, roomId } }),
      RoomPlayer.findOne({ where: { roomId, playerId } })
    ])
    if (!message || !seated) return this.addError('ChatMessageNotFoundErrorType', `${chatMessageId}`)

    await ChatReport.findOrCreate({ where: { chatMessageId, reporterPlayerId: playerId } })
    this.log.info('Chat message reported', { context: { chatMessageId, roomId, reporter: playerId, author: message.playerId } })
    return { reported: true }
  }
}
