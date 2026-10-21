import express from 'express'
import { isAuthenticated } from '~/rest-resources/middlewares/isAuthenticated.middleware'
import rateLimiter from '~/rest-resources/middlewares/rateLimiter.middleware'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import responseValidationMiddleware from '~/rest-resources/middlewares/responseValidation.middleware'
import NotificationController from '~/rest-resources/controllers/notification.controller'

const notificationRoutes = express.Router({ mergeParams: true })

/**
 * @openapi
 * /api/v1/notifications/settings:
 *   get:
 *     summary: Which kinds of push notification the player wants, and how many phones are set up
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: "{ prefs: { dailyBonus, friends, achievements, referrals }, devices }"
 */
notificationRoutes.get(
  '/settings',
  isAuthenticated,
  requestValidationMiddleware({}),
  NotificationController.getSettings,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/notifications/settings:
 *   put:
 *     summary: Switch kinds of push notification on or off
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The settings after the change
 */
notificationRoutes.put(
  '/settings',
  isAuthenticated,
  rateLimiter({ windowMinutes: 10, max: 60 }),
  requestValidationMiddleware({ bodySchema: { $ref: '/notificationSettings.json' } }),
  NotificationController.updateSettings,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/notifications/tokens:
 *   post:
 *     summary: Register this phone to receive push notifications (after the player allows them)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Registered
 */
notificationRoutes.post(
  '/tokens',
  isAuthenticated,
  rateLimiter({ windowMinutes: 10, max: 20 }),
  requestValidationMiddleware({ bodySchema: { $ref: '/registerPushToken.json' } }),
  NotificationController.registerToken,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/notifications/tokens/remove:
 *   post:
 *     summary: Stop sending this player notifications on this phone (sign-out)
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Removed
 */
notificationRoutes.post(
  '/tokens/remove',
  isAuthenticated,
  rateLimiter({ windowMinutes: 10, max: 20 }),
  requestValidationMiddleware({ bodySchema: { $ref: '/unregisterPushToken.json' } }),
  NotificationController.unregisterToken,
  responseValidationMiddleware({})
)

export default notificationRoutes
