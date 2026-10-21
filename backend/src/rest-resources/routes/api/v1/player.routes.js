import express from 'express'
import { isAuthenticated } from '~/rest-resources/middlewares/isAuthenticated.middleware'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import responseValidationMiddleware from '~/rest-resources/middlewares/responseValidation.middleware'
import PlayerController from '~/rest-resources/controllers/player.controller'
import rateLimiter from '~/rest-resources/middlewares/rateLimiter.middleware'

const playerRoutes = express.Router({ mergeParams: true })

/**
 * @openapi
 * /api/v1/players/me:
 *   get:
 *     summary: The signed-in player's profile and wallet
 *     tags: [Players]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Profile and wallet
 */
playerRoutes.get(
  '/me',
  isAuthenticated,
  requestValidationMiddleware({}),
  PlayerController.getMe,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/players/me/devices:
 *   post:
 *     summary: Report the device and connection the app runs on (at sign-in and app start)
 *     tags: [Players]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Recorded
 */
playerRoutes.post(
  '/me/devices',
  isAuthenticated,
  rateLimiter({ windowMinutes: 10, max: 20 }),
  requestValidationMiddleware({ bodySchema: { $ref: '/recordDevice.json' } }),
  PlayerController.recordDevice,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/players/me/history:
 *   get:
 *     summary: The signed-in player's settled rounds, newest first
 *     tags: [Players]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: limit, schema: { type: string } }
 *       - { in: query, name: pageNo, schema: { type: string } }
 *     responses:
 *       200:
 *         description: A page of rounds with stake, return and net
 */
playerRoutes.get(
  '/me/history',
  isAuthenticated,
  requestValidationMiddleware({
    querySchema: {
      type: 'object',
      properties: { limit: { type: 'string', pattern: '^[0-9]+$' }, pageNo: { type: 'string', pattern: '^[0-9]+$' } }
    }
  }),
  PlayerController.getHistory,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/players/me/stats:
 *   get:
 *     summary: The signed-in player's betting habits over a period (totals, bet types, net by day, hours, streaks)
 *     tags: [Players]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: period, schema: { type: string, enum: [week, month, all], default: month } }
 *       - { in: query, name: tz, description: IANA timezone for days and hours, schema: { type: string, example: Asia/Kolkata } }
 *     responses:
 *       200:
 *         description: The player's stats
 */
playerRoutes.get(
  '/me/stats',
  isAuthenticated,
  requestValidationMiddleware({
    querySchema: {
      type: 'object',
      properties: { period: { enum: ['week', 'month', 'all'] }, tz: { type: 'string', pattern: '^[A-Za-z0-9_+/-]{1,64}$' } }
    }
  }),
  PlayerController.getStats,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/players/me/tables:
 *   get:
 *     summary: Open tables the signed-in player is still seated at (to offer a rejoin)
 *     tags: [Players]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The tables
 */
playerRoutes.get(
  '/me/tables',
  isAuthenticated,
  requestValidationMiddleware({}),
  PlayerController.getTables,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/players/leaderboard:
 *   get:
 *     summary: Players ranked by net winnings, with the signed-in player's own rank
 *     tags: [Players]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: period, schema: { type: string, enum: [day, week, all], default: week } }
 *     responses:
 *       200:
 *         description: The top 50 and the player's own row
 */
playerRoutes.get(
  '/leaderboard',
  isAuthenticated,
  requestValidationMiddleware({ querySchema: { type: 'object', properties: { period: { enum: ['day', 'week', 'all'] } } } }),
  PlayerController.getLeaderboard,
  responseValidationMiddleware({})
)

export default playerRoutes
