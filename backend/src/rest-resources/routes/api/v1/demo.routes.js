import express from 'express'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import responseValidationMiddleware from '~/rest-resources/middlewares/responseValidation.middleware'
import rateLimiter from '~/rest-resources/middlewares/rateLimiter.middleware'
import DemoController from '~/rest-resources/controllers/demo.controller'

const demoRoutes = express.Router({ mergeParams: true })

/**
 * @openapi
 * /api/v1/demo:
 *   get:
 *     summary: List demo records
 *     tags: [Demo]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: string }
 *       - in: query
 *         name: pageNo
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: A page of demo records
 *   post:
 *     summary: Create a demo record
 *     tags: [Demo]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *     responses:
 *       200:
 *         description: The created demo record
 */
demoRoutes
  .route('/')
  .get(
    requestValidationMiddleware({}),
    DemoController.getDemos,
    responseValidationMiddleware({})
  )
  .post(
    // Example of overriding the global rate limit with a stricter one for a
    // specific, more sensitive route.
    rateLimiter({ windowMinutes: 1, max: 20 }),
    requestValidationMiddleware({ bodySchema: { $ref: '/demo.json' } }),
    DemoController.createDemo,
    responseValidationMiddleware({})
  )

export default demoRoutes
