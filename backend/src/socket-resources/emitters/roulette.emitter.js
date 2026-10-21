import Flatted from 'flatted'
import Logger from '~/libs/logger'
import socketEmitter from '~/libs/socketEmitter'
import { ERROR_MSG } from '~/utils/constants/errors'
import { SOCKET_EMITTERS, SOCKET_NAMESPACES, SOCKET_ROOMS } from '~/utils/constants/socket'

/**
 * Server-initiated events on /roulette. Sent through the Redis emitter, so
 * they reach clients connected to any node. Services call these only after
 * their transaction has committed.
 */
export default class RouletteEmitter {
  static toTable (roomId, event, data) {
    RouletteEmitter.#emit(SOCKET_ROOMS.ROULETTE_TABLE(roomId), event, data)
  }

  static toPlayer (playerId, event, data) {
    RouletteEmitter.#emit(SOCKET_ROOMS.ROULETTE_PLAYER(playerId), event, data)
  }

  /** { roomId, round: { roundId, roundNumber, status, phaseEndsAt, winningPocket }, serverTime } */
  static roundPhase (roomId, round) {
    RouletteEmitter.toTable(roomId, SOCKET_EMITTERS.ROULETTE_ROUND_PHASE, { roomId, round, serverTime: new Date() })
  }

  static roundTick (roomId, roundId, secondsLeft) {
    RouletteEmitter.toTable(roomId, SOCKET_EMITTERS.ROULETTE_ROUND_TICK, { roomId, roundId, secondsLeft })
  }

  static roundResult (roomId, result) {
    RouletteEmitter.toTable(roomId, SOCKET_EMITTERS.ROULETTE_ROUND_RESULT, { roomId, ...result })
  }

  static betsAccepted (roomId, bets) {
    RouletteEmitter.toTable(roomId, SOCKET_EMITTERS.ROULETTE_BET_ACCEPTED, { roomId, bets })
  }

  static betsRemoved (roomId, betIds) {
    RouletteEmitter.toTable(roomId, SOCKET_EMITTERS.ROULETTE_BET_REMOVED, { roomId, betIds })
  }

  static walletUpdated (playerId, wallet) {
    RouletteEmitter.toPlayer(playerId, SOCKET_EMITTERS.ROULETTE_WALLET_UPDATED, { wallet })
  }

  static playerJoined (roomId, seat) {
    RouletteEmitter.toTable(roomId, SOCKET_EMITTERS.ROULETTE_PLAYER_JOINED, { roomId, seat })
  }

  static playerLeft (roomId, seat) {
    RouletteEmitter.toTable(roomId, SOCKET_EMITTERS.ROULETTE_PLAYER_LEFT, { roomId, seat })
  }

  static chatMessage (roomId, message) {
    RouletteEmitter.toTable(roomId, SOCKET_EMITTERS.ROULETTE_CHAT_MESSAGE, { roomId, message })
  }

  /** The room's settings changed: it started, or it has a new host. */
  static roomUpdated (roomId, room) {
    RouletteEmitter.toTable(roomId, SOCKET_EMITTERS.ROULETTE_ROOM_UPDATED, { roomId, room })
  }

  static roomEnded (roomId, summary) {
    RouletteEmitter.toTable(roomId, SOCKET_EMITTERS.ROULETTE_ROOM_ENDED, { roomId, summary })
  }

  static #emit (channel, event, data) {
    try {
      data = Flatted.parse(Flatted.stringify(data))
      socketEmitter.of(SOCKET_NAMESPACES.ROULETTE).to(channel).emit(event, { data })
    } catch (error) {
      Logger.info('Error In Emitter', { message: ERROR_MSG.EMITTER_ERROR })
      Logger.info('Actual Error', { exception: error })
    }
  }
}
