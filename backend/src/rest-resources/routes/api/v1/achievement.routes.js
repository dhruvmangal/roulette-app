import express from 'express'
import { isAuthenticated } from '~/rest-resources/middlewares/isAuthenticated.middleware'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import responseValidationMiddleware from '~/rest-resources/middlewares/responseValidation.middleware'
import AchievementController from '~/rest-resources/controllers/achievement.controller'

const achievementRoutes = express.Router({ mergeParams: true })

/**
 * @openapi
 * /api/v1/achievements/me:
 *   get:
 *     summary: Every achievement with the player's progress and when they earned it
 *     tags: [Achievements]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: "{ achievements, totals }"
 */
achievementRoutes.get('/me', isAuthenticated, requestValidationMiddleware({}), AchievementController.getMine, responseValidationMiddleware({}))

export default achievementRoutes
