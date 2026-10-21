import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { describeBets, toChatView } from '~/utils/chat.utils'
import { CHAT_KINDS } from '~/utils/constants/game.constants'

/**
 * Writes a line about a player into the table's chat and pushes it to the
 * table. Not typed by anyone, so it skips the word filter and the rate limit.
 */
export const postTableLine = async (ChatMessage, { roomId, seat, playerId, name, kind, data }) => {
  const text = kind === CHAT_KINDS.BETS
    ? describeBets(data)
    : `${data.returned - data.staked >= 0 ? 'won' : 'lost'} ${Math.abs(data.returned - data.staked)} on ${data.pocket}`
  const message = await ChatMessage.create({ roomId, roomPlayerId: seat.roomPlayerId, playerId, text, kind, data })
  RouletteEmitter.chatMessage(roomId, toChatView(message, seat.seat, name))
  return message
}
