import express from 'express'
import rateLimiter from '~/rest-resources/middlewares/rateLimiter.middleware'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import responseValidationMiddleware from '~/rest-resources/middlewares/responseValidation.middleware'
import ConfigController from '~/rest-resources/controllers/config.controller'

const configRoutes = express.Router({ mergeParams: true })

/**
 * @openapi
 * /api/v1/config:
 *   get:
 *     summary: Switches the apps read at start, such as whether ads between rounds are on
 *     tags: [Config]
 *     responses:
 *       200:
 *         description: "{ config: { ads: { web, app } } }"
 */
configRoutes.get(
  '/',
  rateLimiter({ windowMinutes: 1, max: 60 }),
  requestValidationMiddleware({}),
  ConfigController.get,
  responseValidationMiddleware({})
)

export default configRoutes
