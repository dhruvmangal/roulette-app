import express from 'express'
import { isAuthenticated } from '~/rest-resources/middlewares/isAuthenticated.middleware'
import rateLimiter from '~/rest-resources/middlewares/rateLimiter.middleware'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import responseValidationMiddleware from '~/rest-resources/middlewares/responseValidation.middleware'
import ArcadeController from '~/rest-resources/controllers/arcade.controller'

const arcadeRoutes = express.Router({ mergeParams: true })

// Plays move chips, and some are a few seconds apart on purpose; this only stops a runaway client.
const playLimit = rateLimiter({ windowMinutes: 1, max: 120 })

const GAME_QUERY = { type: 'object', properties: { game: { enum: ['AVIATOR'] } }, required: ['game'] }

/**
 * @openapi
 * /api/v1/arcade/plinko/play:
 *   post:
 *     summary: Drop a plinko ball; the stake is taken, the ball is drawn on the server and the winnings paid
 *     tags: [Arcade]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [stake, rows, risk, requestId], properties: { stake: { type: integer }, rows: { type: integer, minimum: 8, maximum: 16 }, risk: { type: string, enum: [low, medium, high] }, requestId: { type: string } } }
 *     responses:
 *       200:
 *         description: The settled round and the new wallet
 */
arcadeRoutes.post('/plinko/play', playLimit, isAuthenticated, requestValidationMiddleware({ bodySchema: { $ref: '/playPlinko.json' } }), ArcadeController.playPlinko, responseValidationMiddleware({}))

/**
 * @openapi
 * /api/v1/arcade/wheel/play:
 *   post:
 *     summary: Spin the prize wheel
 *     tags: [Arcade]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [stake, risk, requestId], properties: { stake: { type: integer }, risk: { type: string, enum: [low, medium, high] }, requestId: { type: string } } }
 *     responses:
 *       200:
 *         description: The settled round and the new wallet
 */
arcadeRoutes.post('/wheel/play', playLimit, isAuthenticated, requestValidationMiddleware({ bodySchema: { $ref: '/playWheel.json' } }), ArcadeController.playWheel, responseValidationMiddleware({}))

/**
 * @openapi
 * /api/v1/arcade/horses/play:
 *   post:
 *     summary: Back one or more horses and run the race
 *     tags: [Arcade]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [bets, requestId], properties: { bets: { type: array, items: { type: object, properties: { horse: { type: integer }, stake: { type: integer } } } }, requestId: { type: string } } }
 *     responses:
 *       200:
 *         description: The finishing order, what was paid and the new wallet
 */
arcadeRoutes.post('/horses/play', playLimit, isAuthenticated, requestValidationMiddleware({ bodySchema: { $ref: '/playHorses.json' } }), ArcadeController.playHorses, responseValidationMiddleware({}))

/**
 * @openapi
 * /api/v1/arcade/crash/start:
 *   post:
 *     summary: Send an Aviator flight up; stakes are taken now and the crash point stays on the server
 *     tags: [Arcade]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [game, bets, requestId], properties: { game: { type: string, enum: [AVIATOR] }, bets: { type: array, items: { type: object, properties: { stake: { type: integer }, autoCashout: { type: number, nullable: true } } } }, requestId: { type: string } } }
 *     responses:
 *       200:
 *         description: The flight in the air (elapsedMs says how far along it is) and the new wallet
 */
arcadeRoutes.post('/crash/start', playLimit, isAuthenticated, requestValidationMiddleware({ bodySchema: { $ref: '/startCrash.json' } }), ArcadeController.startCrash, responseValidationMiddleware({}))

/**
 * @openapi
 * /api/v1/arcade/crash/active:
 *   get:
 *     summary: The flight still in the air for a game, if any (settles one that has ended)
 *     tags: [Arcade]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: game, required: true, schema: { type: string, enum: [AVIATOR] } }
 *     responses:
 *       200:
 *         description: round (or null) and, when a flight just landed, landed
 */
arcadeRoutes.get('/crash/active', rateLimiter({ windowMinutes: 1, max: 240 }), isAuthenticated, requestValidationMiddleware({ querySchema: GAME_QUERY }), ArcadeController.getActiveCrash, responseValidationMiddleware({}))

/**
 * @openapi
 * /api/v1/arcade/crash/{arcadeRoundId}/cashout:
 *   post:
 *     summary: Cash a bet out at the multiplier showing now (or lose it if the flight already ended)
 *     tags: [Arcade]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: arcadeRoundId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [slot], properties: { slot: { type: integer, minimum: 0, maximum: 1 } } }
 *     responses:
 *       200:
 *         description: The round as it now stands and the new wallet
 */
arcadeRoutes.post(
  '/crash/:arcadeRoundId/cashout',
  rateLimiter({ windowMinutes: 1, max: 240 }),
  isAuthenticated,
  requestValidationMiddleware({
    paramsSchema: { type: 'object', properties: { arcadeRoundId: { type: 'string', pattern: '^[0-9]{1,15}$' } } },
    bodySchema: { $ref: '/cashOutCrash.json' }
  }),
  ArcadeController.cashOutCrash,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/arcade/history:
 *   get:
 *     summary: The player's recent finished arcade plays, newest first
 *     tags: [Arcade]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: game, schema: { type: string, enum: [AVIATOR, PLINKO, WHEEL, HORSES] } }
 *       - { in: query, name: limit, schema: { type: string } }
 *     responses:
 *       200:
 *         description: rounds
 */
arcadeRoutes.get(
  '/history',
  isAuthenticated,
  requestValidationMiddleware({
    querySchema: {
      type: 'object',
      properties: { game: { enum: ['AVIATOR', 'PLINKO', 'WHEEL', 'HORSES'] }, limit: { type: 'string', pattern: '^[0-9]{1,2}$' } }
    }
  }),
  ArcadeController.getHistory,
  responseValidationMiddleware({})
)

export default arcadeRoutes
