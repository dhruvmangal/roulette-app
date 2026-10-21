import models, { sequelize } from '~/db/models'
import { socketSchemaBuilder } from '~/libs/ajv'
import Logger from '~/libs/logger'
import { betSchema } from '~/services/game/placeBets.service'
import { ROULETTE_EVENTS, SOCKET_NAMESPACES, SOCKET_ROOMS } from '~/utils/constants/socket'
import authenticationSocketNamespaceMiddleware from '~/socket-resources/middlewares/authenticationSocketNamespace.middleware'
import contextSocketMiddleware from '~/socket-resources/middlewares/contextSocket.middleware'
import requestValidationSocketMiddleware from '~/socket-resources/middlewares/requestValidationSocket.middleware'
import RouletteHandler from '~/socket-resources/handlers/roulette.handler'

const roomId = { type: 'integer', minimum: 1 }
const requestId = { type: 'string', minLength: 1, maxLength: 64 }
const anyResponse = { type: 'object' }

const schemas = socketSchemaBuilder({
  [ROULETTE_EVENTS.ROOM_JOIN]: {
    request: { type: 'object', properties: { roomId }, required: ['roomId'] },
    response: anyResponse
  },
  [ROULETTE_EVENTS.ROOM_START]: {
    request: { type: 'object', properties: { roomId }, required: ['roomId'] },
    response: anyResponse
  },
  [ROULETTE_EVENTS.ROOM_LEAVE]: {
    request: { type: 'object', properties: { roomId }, required: ['roomId'] },
    response: anyResponse
  },
  [ROULETTE_EVENTS.BET_PLACE]: {
    request: {
      type: 'object',
      properties: { roomId, requestId, bets: { type: 'array', minItems: 1, maxItems: 50, items: betSchema } },
      required: ['roomId', 'bets']
    },
    response: anyResponse
  },
  [ROULETTE_EVENTS.BET_REMOVE]: {
    request: { type: 'object', properties: { roomId, betId: { type: 'integer', minimum: 1 } }, required: ['roomId', 'betId'] },
    response: anyResponse
  },
  [ROULETTE_EVENTS.BET_CLEAR]: {
    request: { type: 'object', properties: { roomId }, required: ['roomId'] },
    response: anyResponse
  },
  [ROULETTE_EVENTS.CHAT_SEND]: {
    request: {
      type: 'object',
      properties: { roomId, text: { type: 'string', minLength: 1, maxLength: 1000 }, reaction: { type: 'string', maxLength: 16 } },
      required: ['roomId'],
      anyOf: [{ required: ['text'] }, { required: ['reaction'] }]
    },
    response: anyResponse
  },
  [ROULETTE_EVENTS.CHAT_SHARE_BETS]: {
    request: { type: 'object', properties: { roomId, share: { type: 'boolean' } }, required: ['roomId', 'share'] },
    response: anyResponse
  },
  [ROULETTE_EVENTS.CHAT_REPORT]: {
    request: { type: 'object', properties: { roomId, chatMessageId: { type: 'integer', minimum: 1 } }, required: ['roomId', 'chatMessageId'] },
    response: anyResponse
  },
  [ROULETTE_EVENTS.BET_REPEAT_LAST]: {
    request: { type: 'object', properties: { roomId, requestId }, required: ['roomId'] },
    response: anyResponse
  }
})

/**
 * @export
 * @param {import('socket.io').Server} io
 * The game namespace. Signed-in players only; each socket joins its own
 * `player:<id>` room (wallet updates) and, via room:join, the tables it sits at.
 */
export default function (io) {
  const namespace = io.of(SOCKET_NAMESPACES.ROULETTE)
  namespace.use(authenticationSocketNamespaceMiddleware)

  namespace.on('connection', (socket) => {
    socket.join(SOCKET_ROOMS.ROULETTE_PLAYER(socket.user.playerId))
    // Lets the server find a player's sockets across nodes (fetchSockets).
    socket.data.playerId = socket.user.playerId
    socket.on('disconnecting', () => {
      RouletteHandler.disconnecting(socket, { dbModels: models, sequelize, logger: Logger })
        .catch(error => Logger.error('RouletteNamespace', { message: 'Could not record a player leaving', exception: error }))
    })

    socket.use(contextSocketMiddleware(socket, schemas))
    socket.use(requestValidationSocketMiddleware)

    socket.on(ROULETTE_EVENTS.ROOM_JOIN, RouletteHandler.joinRoom)
    socket.on(ROULETTE_EVENTS.ROOM_LEAVE, RouletteHandler.leaveRoom)
    socket.on(ROULETTE_EVENTS.ROOM_START, RouletteHandler.startRoom)
    socket.on(ROULETTE_EVENTS.BET_PLACE, RouletteHandler.placeBets)
    socket.on(ROULETTE_EVENTS.BET_REMOVE, RouletteHandler.removeBet)
    socket.on(ROULETTE_EVENTS.BET_CLEAR, RouletteHandler.clearBets)
    socket.on(ROULETTE_EVENTS.BET_REPEAT_LAST, RouletteHandler.repeatLast)
    socket.on(ROULETTE_EVENTS.CHAT_SEND, RouletteHandler.sendChat)
    socket.on(ROULETTE_EVENTS.CHAT_REPORT, RouletteHandler.reportChat)
    socket.on(ROULETTE_EVENTS.CHAT_SHARE_BETS, RouletteHandler.shareBets)
  })
}
