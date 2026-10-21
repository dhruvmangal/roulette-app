import express from 'express'
import { isAuthenticated } from '~/rest-resources/middlewares/isAuthenticated.middleware'
import rateLimiter from '~/rest-resources/middlewares/rateLimiter.middleware'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import responseValidationMiddleware from '~/rest-resources/middlewares/responseValidation.middleware'
import ReferralController from '~/rest-resources/controllers/referral.controller'

const referralRoutes = express.Router({ mergeParams: true })

/**
 * @openapi
 * /api/v1/referrals/me:
 *   get:
 *     summary: The player's referral code, rewards, friends who joined with it, and who referred them
 *     tags: [Referrals]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The player's Refer & earn page
 */
referralRoutes.get(
  '/me',
  isAuthenticated,
  requestValidationMiddleware({}),
  ReferralController.getMine,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/referrals/claim:
 *   post:
 *     summary: Join with a friend's referral code (from a link, or typed within 7 days of joining)
 *     tags: [Referrals]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [code], properties: { code: { type: string, example: K7QM2XA } } }
 *     responses:
 *       200:
 *         description: Linked to the friend; rewards follow once you qualify
 */
referralRoutes.post(
  '/claim',
  // Slows down guessing codes.
  rateLimiter({ windowMinutes: 10, max: 10 }),
  isAuthenticated,
  requestValidationMiddleware({ bodySchema: { $ref: '/claimReferral.json' } }),
  ReferralController.claim,
  responseValidationMiddleware({})
)

export default referralRoutes
