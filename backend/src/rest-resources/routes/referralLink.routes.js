import express from 'express'
import contextMiddleware from '~/rest-resources/middlewares/context.middleware'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import InviteController from '~/rest-resources/controllers/invite.controller'

const referralLinkRoutes = express.Router({ mergeParams: true })

/**
 * @openapi
 * /r/{code}:
 *   get:
 *     summary: A referral link's page; chat apps read its preview tags, people are forwarded to the game
 *     tags: [Referrals]
 *     responses:
 *       200:
 *         description: HTML
 */
referralLinkRoutes.get(
  '/:code',
  contextMiddleware(false),
  requestValidationMiddleware({ paramsSchema: { type: 'object', properties: { code: { type: 'string', pattern: '^[A-Za-z0-9]{7}$' } }, required: ['code'] } }),
  InviteController.referral
)

export default referralLinkRoutes
