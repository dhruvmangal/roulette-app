import express from 'express'
import rateLimiter from '~/rest-resources/middlewares/rateLimiter.middleware'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import responseValidationMiddleware from '~/rest-resources/middlewares/responseValidation.middleware'
import LinkController from '~/rest-resources/controllers/link.controller'

const linkRoutes = express.Router({ mergeParams: true })

/**
 * @openapi
 * /api/v1/links/deferred:
 *   post:
 *     summary: A freshly installed app asks for the invite or referral link its user opened before installing
 *     tags: [Links]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [platform], properties: { platform: { type: string, enum: [ios, android] } } }
 *     responses:
 *       200:
 *         description: "{ link: { kind: join | ref, code } | null }"
 */
linkRoutes.post(
  '/deferred',
  // Not signed in yet, so the limit is by address: it also slows down anyone fishing for codes.
  rateLimiter({ windowMinutes: 60, max: 10 }),
  requestValidationMiddleware({
    bodySchema: { type: 'object', properties: { platform: { enum: ['ios', 'android'] } }, required: ['platform'], additionalProperties: false }
  }),
  LinkController.claimDeferred,
  responseValidationMiddleware({})
)

export default linkRoutes
