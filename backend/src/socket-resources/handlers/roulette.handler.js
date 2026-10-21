import {
  GetRoomStateService, LeaveRoomService, PlaceBetsService, RepeatLastBetsService, ReportChatMessageService, SendChatMessageService,
  SetPresenceService, SetShareBetsService, StartRoomService, WithdrawBetsService
} from '~/services/game'
import { SOCKET_ROOMS } from '~/utils/constants/socket'
import { sendSocketResponse } from '~/utils/response.helpers'

const playerOf = (context) => context.socket.user.playerId

/**
 * /roulette events. The server is authoritative: a client only says what it
 * wants to do; seat, phase, limits and funds are checked by the services, and
 * outcomes come from the server alone.
 */
export default class RouletteHandler {
  /** Subscribes to a table the player sits at and returns its full state (also used to resync after a reconnect). */
  static async joinRoom ({ payload, context }, ack) {
    const playerId = playerOf(context)
    const state = await GetRoomStateService.execute({ roomId: payload.roomId, playerId, requireSeat: true }, context)
    if (state.successful) {
      context.socket.join(SOCKET_ROOMS.ROULETTE_TABLE(payload.roomId))
      // Back at the table: clear the away mark and wake a paused room.
      await SetPresenceService.execute({ playerId, roomIds: [payload.roomId], present: true }, context)
    }
    sendSocketResponse({ resCallback: ack }, { result: state.result, successful: state.successful, serviceErrors: state.errors })
  }

  /** The socket is closing: its tables are marked away (the seat is kept for a while). */
  static async disconnecting (socket, context) {
    const roomIds = [...socket.rooms]
      .map(room => /^room:(\d+)$/.exec(room)?.[1])
      .filter(Boolean)
      .map(Number)
    if (roomIds.length) await SetPresenceService.execute({ playerId: socket.user.playerId, roomIds, present: false }, context)
  }

  static async leaveRoom ({ payload, context }, ack) {
    const left = await LeaveRoomService.execute({ roomId: payload.roomId, playerId: playerOf(context) }, context)
    if (left.successful) context.socket.leave(SOCKET_ROOMS.ROULETTE_TABLE(payload.roomId))
    sendSocketResponse({ resCallback: ack }, { result: left.result, successful: left.successful, serviceErrors: left.errors })
  }

  /** The host starts a waiting private table; rounds begin straight away. */
  static async startRoom ({ payload, context }, ack) {
    const started = await StartRoomService.execute({ roomId: payload.roomId, playerId: playerOf(context) }, context)
    sendSocketResponse({ resCallback: ack }, { result: started.result, successful: started.successful, serviceErrors: started.errors })
  }

  static async placeBets ({ payload, context }, ack) {
    const { roomId, bets, requestId } = payload
    const placed = await PlaceBetsService.execute({ roomId, bets, requestId, playerId: playerOf(context) }, context)
    sendSocketResponse({ resCallback: ack }, { result: placed.result, successful: placed.successful, serviceErrors: placed.errors })
  }

  static async removeBet ({ payload, context }, ack) {
    const { roomId, betId } = payload
    const removed = await WithdrawBetsService.execute({ roomId, betId, playerId: playerOf(context) }, context)
    sendSocketResponse({ resCallback: ack }, { result: removed.result, successful: removed.successful, serviceErrors: removed.errors })
  }

  static async clearBets ({ payload, context }, ack) {
    const cleared = await WithdrawBetsService.execute({ roomId: payload.roomId, playerId: playerOf(context) }, context)
    sendSocketResponse({ resCallback: ack }, { result: cleared.result, successful: cleared.successful, serviceErrors: cleared.errors })
  }

  static async repeatLast ({ payload, context }, ack) {
    const { roomId, requestId } = payload
    const placed = await RepeatLastBetsService.execute({ roomId, requestId, playerId: playerOf(context) }, context)
    sendSocketResponse({ resCallback: ack }, { result: placed.result, successful: placed.successful, serviceErrors: placed.errors })
  }

  static async sendChat ({ payload, context }, ack) {
    const { roomId, text, reaction } = payload
    const sent = await SendChatMessageService.execute({ roomId, text, reaction, playerId: playerOf(context) }, context)
    sendSocketResponse({ resCallback: ack }, { result: sent.result, successful: sent.successful, serviceErrors: sent.errors })
  }

  static async reportChat ({ payload, context }, ack) {
    const { roomId, chatMessageId } = payload
    const reported = await ReportChatMessageService.execute({ roomId, chatMessageId, playerId: playerOf(context) }, context)
    sendSocketResponse({ resCallback: ack }, { result: reported.result, successful: reported.successful, serviceErrors: reported.errors })
  }

  static async shareBets ({ payload, context }, ack) {
    const { roomId, share } = payload
    const set = await SetShareBetsService.execute({ roomId, share, playerId: playerOf(context) }, context)
    sendSocketResponse({ resCallback: ack }, { result: set.result, successful: set.successful, serviceErrors: set.errors })
  }
}
