import express from 'express'
import { isAuthenticated } from '~/rest-resources/middlewares/isAuthenticated.middleware'
import rateLimiter from '~/rest-resources/middlewares/rateLimiter.middleware'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import responseValidationMiddleware from '~/rest-resources/middlewares/responseValidation.middleware'
import FriendController from '~/rest-resources/controllers/friend.controller'

const friendRoutes = express.Router({ mergeParams: true })

const digits = { type: 'string', pattern: '^[0-9]{1,10}$' }
const idParam = (name) => ({ paramsSchema: { type: 'object', properties: { [name]: digits }, required: [name] } })

/**
 * @openapi
 * /api/v1/friends:
 *   get:
 *     summary: Friends (with who is online and where), requests to answer, and requests sent
 *     tags: [Friends]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: "{ friends, incoming, outgoing }"
 */
friendRoutes.get('/', isAuthenticated, requestValidationMiddleware({}), FriendController.list, responseValidationMiddleware({}))

/**
 * @openapi
 * /api/v1/friends/requests:
 *   post:
 *     summary: Ask a player, by username, to be friends
 *     tags: [Friends]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The request (or the friendship, if they had already asked)
 */
friendRoutes.post(
  '/requests',
  isAuthenticated,
  // Slows down hunting for usernames and spamming requests.
  rateLimiter({ windowMinutes: 10, max: 20 }),
  requestValidationMiddleware({ bodySchema: { $ref: '/friendRequest.json' } }),
  FriendController.request,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/friends/requests/{friendshipId}/accept:
 *   post:
 *     summary: Accept a friend request
 *     tags: [Friends]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The new friend
 */
friendRoutes.post('/requests/:friendshipId/accept', isAuthenticated, requestValidationMiddleware(idParam('friendshipId')), FriendController.accept, responseValidationMiddleware({}))

/**
 * @openapi
 * /api/v1/friends/requests/{friendshipId}/decline:
 *   post:
 *     summary: Decline a friend request (the sender isn't told)
 *     tags: [Friends]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Declined
 */
friendRoutes.post('/requests/:friendshipId/decline', isAuthenticated, requestValidationMiddleware(idParam('friendshipId')), FriendController.decline, responseValidationMiddleware({}))

/**
 * @openapi
 * /api/v1/friends/{playerId}/invite:
 *   post:
 *     summary: Invite a friend to the table the player is sitting at
 *     tags: [Friends]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Sent
 */
friendRoutes.post(
  '/:playerId/invite',
  isAuthenticated,
  rateLimiter({ windowMinutes: 1, max: 30 }),
  requestValidationMiddleware({ ...idParam('playerId'), bodySchema: { $ref: '/friendInvite.json' } }),
  FriendController.invite,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/friends/{playerId}:
 *   delete:
 *     summary: Remove a friend, or take back a request sent to them
 *     tags: [Friends]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Removed
 */
friendRoutes.delete('/:playerId', isAuthenticated, requestValidationMiddleware(idParam('playerId')), FriendController.remove, responseValidationMiddleware({}))

export default friendRoutes
