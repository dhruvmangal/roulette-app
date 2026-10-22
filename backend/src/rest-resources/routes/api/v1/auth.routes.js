import express from 'express'
import contextMiddleware from '~/rest-resources/middlewares/context.middleware'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import responseValidationMiddleware from '~/rest-resources/middlewares/responseValidation.middleware'
import rateLimiter from '~/rest-resources/middlewares/rateLimiter.middleware'
import { isAuthenticated } from '~/rest-resources/middlewares/isAuthenticated.middleware'
import AuthController from '~/rest-resources/controllers/auth.controller'
import config from '~/configs/app.config'

const authRoutes = express.Router({ mergeParams: true })

// Creating accounts is limited hardest: each one is granted signup chips.
// A first Google or Apple sign-in creates one too.
// Relaxed outside production so repeated sign-in testing doesn't lock you out.
const accountCreationLimit = () => rateLimiter({
  windowMinutes: 15,
  max: config.get('env') === 'production' ? 10 : 1000
})

/**
 * @openapi
 * /api/v1/auth/providers:
 *   get:
 *     summary: Which sign-in providers are on, with the public client ID for each button
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: "{ providers: { google: { clientId } | null, apple: { clientId } | null } }"
 */
authRoutes.get(
  '/providers',
  requestValidationMiddleware({}),
  AuthController.providers,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/auth/guest:
 *   post:
 *     summary: Play as a guest; grants the signup bonus
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: The guest player, wallet and token pair
 */
authRoutes.post(
  '/guest',
  accountCreationLimit(),
  requestValidationMiddleware({}),
  contextMiddleware(true),
  AuthController.guest,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Trade a refresh token for a new token pair
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: The player and a new token pair
 */
authRoutes.post(
  '/refresh',
  rateLimiter({ windowMinutes: 1, max: 30 }),
  requestValidationMiddleware({ bodySchema: { $ref: '/refreshToken.json' } }),
  AuthController.refresh,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     summary: End this login; its refresh token stops working
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: Logged out (also when the token was already invalid)
 */
authRoutes.post(
  '/logout',
  rateLimiter({ windowMinutes: 1, max: 30 }),
  requestValidationMiddleware({ bodySchema: { $ref: '/refreshToken.json' } }),
  AuthController.logout,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/auth/logout-all:
 *   post:
 *     summary: Sign out on every device
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Every token for this player is revoked
 */
authRoutes.post(
  '/logout-all',
  rateLimiter({ windowMinutes: 1, max: 10 }),
  isAuthenticated,
  requestValidationMiddleware({}),
  AuthController.logoutEverywhere,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/auth/{provider}:
 *   post:
 *     summary: Sign in with a Google or Apple ID token; the first sign-in creates the player
 *     tags: [Auth]
 *     parameters:
 *       - { in: path, name: provider, required: true, schema: { type: string, enum: [google, apple] } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken: { type: string }
 *               nonce: { type: string, description: 'The raw nonce sent to the provider (Apple gets its SHA-256)' }
 *               name: { type: string, description: 'Apple only gives the name to the app, at first sign-in' }
 *     responses:
 *       200:
 *         description: The player, wallet, token pair, and whether the player is new
 */
// Declared after /guest, /refresh, /logout and /logout-all, and limited to
// the two provider names, so it never shadows them.
authRoutes.post(
  '/:provider(google|apple)',
  accountCreationLimit(),
  requestValidationMiddleware({ bodySchema: { $ref: '/providerToken.json' } }),
  AuthController.signInWithProvider,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/auth/discord:
 *   post:
 *     summary: Sign in from a Discord Activity with the login code Discord gave the app; the first sign-in creates the player
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string }
 *     responses:
 *       200:
 *         description: The player, wallet, token pair, and whether the player is new
 */
authRoutes.post(
  '/discord',
  accountCreationLimit(),
  requestValidationMiddleware({ bodySchema: { $ref: '/discordCode.json' } }),
  AuthController.signInWithDiscord,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/auth/link/{provider}:
 *   post:
 *     summary: Link a Google or Apple account to the signed-in player (saves a guest's account)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: provider, required: true, schema: { type: string, enum: [google, apple] } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken: { type: string }
 *               nonce: { type: string }
 *               name: { type: string }
 *     responses:
 *       200:
 *         description: The profile with the provider linked
 */
authRoutes.post(
  '/link/:provider(google|apple)',
  rateLimiter({ windowMinutes: 15, max: 10 }),
  isAuthenticated,
  requestValidationMiddleware({ bodySchema: { $ref: '/providerToken.json' } }),
  AuthController.linkProvider,
  responseValidationMiddleware({})
)

export default authRoutes
