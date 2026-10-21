import express from 'express'
import contextMiddleware from '~/rest-resources/middlewares/context.middleware'
import { isAuthenticated } from '~/rest-resources/middlewares/isAuthenticated.middleware'
import rateLimiter from '~/rest-resources/middlewares/rateLimiter.middleware'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import responseValidationMiddleware from '~/rest-resources/middlewares/responseValidation.middleware'
import BonusController from '~/rest-resources/controllers/bonus.controller'

const bonusRoutes = express.Router({ mergeParams: true })

/**
 * @openapi
 * /api/v1/bonuses:
 *   get:
 *     summary: Bonuses the player can claim, with amounts and next availability
 *     tags: [Bonuses]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The bonuses
 */
bonusRoutes.get(
  '/',
  isAuthenticated,
  requestValidationMiddleware({}),
  BonusController.getBonuses,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/bonuses/{code}/claim:
 *   post:
 *     summary: Claim a bonus into the wallet
 *     tags: [Bonuses]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: The claim and the updated wallet
 */
bonusRoutes.post(
  '/:code/claim',
  rateLimiter({ windowMinutes: 1, max: 30 }),
  isAuthenticated,
  requestValidationMiddleware({
    paramsSchema: {
      type: 'object',
      properties: { code: { type: 'string', pattern: '^[A-Z0-9_]{2,32}$' } },
      required: ['code']
    }
  }),
  contextMiddleware(true),
  BonusController.claim,
  responseValidationMiddleware({})
)

export default bonusRoutes
