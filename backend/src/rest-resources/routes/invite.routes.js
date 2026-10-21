import express from 'express'
import contextMiddleware from '~/rest-resources/middlewares/context.middleware'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import InviteController from '~/rest-resources/controllers/invite.controller'

const inviteRoutes = express.Router({ mergeParams: true })

/**
 * @openapi
 * /join/{code}:
 *   get:
 *     summary: An invite link's page; chat apps read its preview tags, people are forwarded to the table
 *     tags: [Rooms]
 *     responses:
 *       200:
 *         description: HTML
 */
inviteRoutes.get(
  '/:code',
  contextMiddleware(false),
  requestValidationMiddleware({ paramsSchema: { type: 'object', properties: { code: { type: 'string', pattern: '^[A-Za-z0-9]{6}$' } }, required: ['code'] } }),
  InviteController.page
)

export default inviteRoutes
