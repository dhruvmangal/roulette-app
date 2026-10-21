import express from 'express'
import { isAuthenticated } from '~/rest-resources/middlewares/isAuthenticated.middleware'
import rateLimiter from '~/rest-resources/middlewares/rateLimiter.middleware'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import responseValidationMiddleware from '~/rest-resources/middlewares/responseValidation.middleware'
import RoomController from '~/rest-resources/controllers/room.controller'
import { VARIANTS } from '~/utils/constants/game.constants'

const roomRoutes = express.Router({ mergeParams: true })

const roomIdParams = {
  type: 'object',
  properties: { roomId: { type: 'string', pattern: '^[1-9][0-9]{0,9}$' } },
  required: ['roomId']
}

// Room services commit their own transactions before telling the table over
// sockets, so these routes do not use contextMiddleware(true).

/**
 * @openapi
 * /api/v1/rooms:
 *   get:
 *     summary: Open public tables
 *     tags: [Rooms]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: variant, schema: { type: string, enum: [AMERICAN, ENGLISH] } }
 *     responses:
 *       200:
 *         description: Public tables, busiest first
 *   post:
 *     summary: Open a vs-computer or private table
 *     tags: [Rooms]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [variant, mode]
 *             properties:
 *               variant: { type: string, enum: [AMERICAN, ENGLISH] }
 *               mode: { type: string, enum: [VS_COMPUTER, PRIVATE] }
 *               bots: { type: integer, minimum: 0, maximum: 7 }
 *               totalRounds: { type: integer, nullable: true }
 *               bettingSeconds: { type: integer, minimum: 10, maximum: 60 }
 *               minBet: { type: integer }
 *               maxBet: { type: integer }
 *     responses:
 *       200:
 *         description: The new table's state, with its join code
 */
roomRoutes.route('/')
  .get(
    isAuthenticated,
    requestValidationMiddleware({ querySchema: { type: 'object', properties: { variant: { enum: VARIANTS } } } }),
    RoomController.listPublic,
    responseValidationMiddleware({})
  )
  .post(
    rateLimiter({ windowMinutes: 1, max: 10 }),
    isAuthenticated,
    requestValidationMiddleware({ bodySchema: { $ref: '/createRoom.json' } }),
    RoomController.create,
    responseValidationMiddleware({})
  )

/**
 * @openapi
 * /api/v1/rooms/quick-match:
 *   post:
 *     summary: Sit at the busiest public table with a free seat, or open one
 *     tags: [Rooms]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [variant]
 *             properties:
 *               variant: { type: string, enum: [AMERICAN, ENGLISH] }
 *     responses:
 *       200:
 *         description: The table's state
 */
roomRoutes.post(
  '/quick-match',
  rateLimiter({ windowMinutes: 1, max: 20 }),
  isAuthenticated,
  requestValidationMiddleware({ bodySchema: { $ref: '/quickMatch.json' } }),
  RoomController.quickMatch,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/rooms/join:
 *   post:
 *     summary: Sit at a table by its code
 *     tags: [Rooms]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string }
 *     responses:
 *       200:
 *         description: The table's state
 */
roomRoutes.post(
  '/join',
  rateLimiter({ windowMinutes: 1, max: 20 }),
  isAuthenticated,
  requestValidationMiddleware({ bodySchema: { $ref: '/joinRoom.json' } }),
  RoomController.join,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/rooms/discord:
 *   post:
 *     summary: Sit at the private table for a Discord Activity, opening it if the player is first
 *     tags: [Rooms]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [instanceId]
 *             properties:
 *               instanceId: { type: string, description: "Discord's id for the running Activity" }
 *               variant: { type: string }
 *     responses:
 *       200:
 *         description: The table's state
 */
roomRoutes.post(
  '/discord',
  rateLimiter({ windowMinutes: 1, max: 20 }),
  isAuthenticated,
  requestValidationMiddleware({ bodySchema: { $ref: '/joinDiscordTable.json' } }),
  RoomController.joinDiscord,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/rooms/{roomId}:
 *   get:
 *     summary: A table's full state (seats, round, bets, recent results)
 *     tags: [Rooms]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: roomId, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: The table's state
 */
roomRoutes.get(
  '/:roomId',
  isAuthenticated,
  requestValidationMiddleware({ paramsSchema: roomIdParams }),
  RoomController.getState,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/rooms/{roomId}/leave:
 *   post:
 *     summary: Leave a table; open bets are refunded
 *     tags: [Rooms]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: roomId, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Left
 */
roomRoutes.post(
  '/:roomId/leave',
  isAuthenticated,
  requestValidationMiddleware({ paramsSchema: roomIdParams }),
  RoomController.leave,
  responseValidationMiddleware({})
)

export default roomRoutes
