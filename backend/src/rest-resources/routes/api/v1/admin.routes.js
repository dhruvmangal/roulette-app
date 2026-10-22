import express from 'express'
import rateLimiter from '~/rest-resources/middlewares/rateLimiter.middleware'
import { isAdmin } from '~/rest-resources/middlewares/isAdmin.middleware'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import responseValidationMiddleware from '~/rest-resources/middlewares/responseValidation.middleware'
import AdminController from '~/rest-resources/controllers/admin.controller'
import { ADMIN_TARGETS, PLAYER_SORTS } from '~/utils/constants/admin.constants'
import { ROOM_MODES, ROOM_STATUS } from '~/utils/constants/game.constants'
import { PLAYER_STATUS } from '~/utils/constants/player.constants'
import { ANNOUNCEMENT_AUDIENCES } from '~/utils/constants/notification.constants'
import { REFERRAL_STATUS } from '~/utils/constants/referral.constants'
import { WALLET_DIRECTIONS, WALLET_TRANSACTION_TYPES } from '~/utils/constants/wallet.constants'

const adminRoutes = express.Router({ mergeParams: true })

const digits = { type: 'string', pattern: '^[0-9]{1,12}$' }
const page = { limit: digits, pageNo: digits }
const idParam = (name) => ({ paramsSchema: { type: 'object', properties: { [name]: digits }, required: [name] } })

/**
 * @openapi
 * /api/v1/admin/auth/login:
 *   post:
 *     summary: Admin app sign-in with email and password
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: "{ admin, accessToken }"
 */
adminRoutes.post(
  '/auth/login',
  rateLimiter({ windowMinutes: 15, max: 10 }),
  requestValidationMiddleware({ bodySchema: { $ref: '/adminLogin.json' } }),
  AdminController.login,
  responseValidationMiddleware({})
)

// Everything below needs an admin token.
adminRoutes.use(isAdmin)

/**
 * @openapi
 * /api/v1/admin/auth/me:
 *   get:
 *     summary: The signed-in admin
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 */
adminRoutes.get('/auth/me', requestValidationMiddleware({}), AdminController.me, responseValidationMiddleware({}))

/**
 * @openapi
 * /api/v1/admin/auth/logout:
 *   post:
 *     summary: Revoke every token the admin holds
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 */
adminRoutes.post('/auth/logout', requestValidationMiddleware({}), AdminController.logout, responseValidationMiddleware({}))

/**
 * @openapi
 * /api/v1/admin/stats:
 *   get:
 *     summary: Dashboard totals and a per-day series
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: days, schema: { type: string, default: '14' } }
 */
adminRoutes.get(
  '/stats',
  requestValidationMiddleware({ querySchema: { type: 'object', properties: { days: digits } } }),
  AdminController.stats,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/admin/players:
 *   get:
 *     summary: Players with balances; search by id, username or email
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string, enum: [active, banned, inactive] } }
 *       - { in: query, name: kind, schema: { type: string, enum: [guest, registered] } }
 *       - { in: query, name: sort, schema: { type: string } }
 *       - { in: query, name: limit, schema: { type: string } }
 *       - { in: query, name: pageNo, schema: { type: string } }
 */
adminRoutes.get(
  '/players',
  requestValidationMiddleware({
    querySchema: {
      type: 'object',
      properties: {
        search: { type: 'string', maxLength: 100 },
        status: { enum: Object.values(PLAYER_STATUS) },
        kind: { enum: ['guest', 'registered'] },
        sort: { enum: Object.keys(PLAYER_SORTS) },
        ...page
      }
    }
  }),
  AdminController.listPlayers,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/admin/players/{playerId}:
 *   get:
 *     summary: One player's account, wallet, logins and totals
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 */
adminRoutes.get(
  '/players/:playerId',
  requestValidationMiddleware(idParam('playerId')),
  AdminController.getPlayer,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/admin/players/{playerId}/status:
 *   patch:
 *     summary: Ban, deactivate or reinstate a player (a reason is required)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 */
adminRoutes.patch(
  '/players/:playerId/status',
  requestValidationMiddleware({ ...idParam('playerId'), bodySchema: { $ref: '/adminSetPlayerStatus.json' } }),
  AdminController.setPlayerStatus,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/admin/players/{playerId}/logout:
 *   post:
 *     summary: Sign a player out on every device
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 */
adminRoutes.post(
  '/players/:playerId/logout',
  requestValidationMiddleware(idParam('playerId')),
  AdminController.forcePlayerLogout,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/admin/players/{playerId}/wallet/adjust:
 *   post:
 *     summary: Credit or debit a player's chips (an ADMIN_ADJUST ledger row)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 */
adminRoutes.post(
  '/players/:playerId/wallet/adjust',
  rateLimiter({ windowMinutes: 1, max: 30 }),
  requestValidationMiddleware({ ...idParam('playerId'), bodySchema: { $ref: '/adminAdjustWallet.json' } }),
  AdminController.adjustWallet,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/admin/transactions:
 *   get:
 *     summary: The wallet ledger across all players, newest first
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: playerId, schema: { type: string } }
 *       - { in: query, name: type, schema: { type: string } }
 *       - { in: query, name: direction, schema: { type: string, enum: [CREDIT, DEBIT] } }
 *       - { in: query, name: minAmount, schema: { type: string } }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 */
adminRoutes.get(
  '/transactions',
  requestValidationMiddleware({
    querySchema: {
      type: 'object',
      properties: {
        playerId: digits,
        type: { enum: Object.values(WALLET_TRANSACTION_TYPES) },
        direction: { enum: Object.values(WALLET_DIRECTIONS) },
        minAmount: digits,
        from: { type: 'string', format: 'date-time' },
        to: { type: 'string', format: 'date-time' },
        ...page
      }
    }
  }),
  AdminController.listTransactions,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/admin/bonuses:
 *   get:
 *     summary: Bonuses with claim counts
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 */
adminRoutes.get('/bonuses', requestValidationMiddleware({}), AdminController.listBonuses, responseValidationMiddleware({}))

/**
 * @openapi
 * /api/v1/admin/bonuses/{bonusId}:
 *   patch:
 *     summary: Change a bonus's amount, limits or on/off switch
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 */
adminRoutes.patch(
  '/bonuses/:bonusId',
  requestValidationMiddleware({ ...idParam('bonusId'), bodySchema: { $ref: '/adminUpdateBonus.json' } }),
  AdminController.updateBonus,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/admin/settings/ads:
 *   get:
 *     summary: Whether ads between rounds are on for the website and the mobile app
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *   patch:
 *     summary: Turn ads between rounds on or off for the website and/or the mobile app
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 */
adminRoutes.get('/settings/ads', requestValidationMiddleware({}), AdminController.getAdsSettings, responseValidationMiddleware({}))
adminRoutes.patch(
  '/settings/ads',
  requestValidationMiddleware({ bodySchema: { $ref: '/adminUpdateAdsSettings.json' } }),
  AdminController.updateAdsSettings,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/admin/rooms:
 *   get:
 *     summary: Tables, newest first, with seated players and stakes
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 */
adminRoutes.get(
  '/rooms',
  requestValidationMiddleware({
    querySchema: {
      type: 'object',
      properties: { status: { enum: Object.values(ROOM_STATUS) }, mode: { enum: Object.values(ROOM_MODES) }, ...page }
    }
  }),
  AdminController.listRooms,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/admin/chat-reports:
 *   get:
 *     summary: Reported chat messages
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 */
adminRoutes.get(
  '/chat-reports',
  requestValidationMiddleware({ querySchema: { type: 'object', properties: page } }),
  AdminController.listChatReports,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/admin/referrals:
 *   get:
 *     summary: Who referred whom, with status, rewards paid and why a referral was rejected
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 */
adminRoutes.get(
  '/referrals',
  requestValidationMiddleware({
    querySchema: { type: 'object', properties: { status: { enum: Object.values(REFERRAL_STATUS) }, playerId: digits, ...page } }
  }),
  AdminController.listReferrals,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/admin/announcements:
 *   get:
 *     summary: Push notifications admins have sent, newest first, with how each went
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 */
adminRoutes.get(
  '/announcements',
  requestValidationMiddleware({ querySchema: { type: 'object', properties: page } }),
  AdminController.listAnnouncements,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/admin/announcements/reach:
 *   get:
 *     summary: How many players and phones an audience reaches, and whether push is set up on the server
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: audience, required: true, schema: { type: string, enum: [ALL, INACTIVE, PLAYER] } }
 *       - { in: query, name: days, schema: { type: string } }
 *       - { in: query, name: playerId, schema: { type: string } }
 */
adminRoutes.get(
  '/announcements/reach',
  requestValidationMiddleware({
    querySchema: { type: 'object', properties: { audience: { enum: Object.values(ANNOUNCEMENT_AUDIENCES) }, days: digits, playerId: digits }, required: ['audience'] }
  }),
  AdminController.announcementReach,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/admin/announcements:
 *   post:
 *     summary: Send a push notification to everyone, to players who have been away, or to one player
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 */
adminRoutes.post(
  '/announcements',
  // A mistake here reaches every player, so even an admin is slowed down.
  rateLimiter({ windowMinutes: 10, max: 10 }),
  requestValidationMiddleware({ bodySchema: { $ref: '/adminSendAnnouncement.json' } }),
  AdminController.sendAnnouncement,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/admin/audit-logs:
 *   get:
 *     summary: What admins changed, newest first
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 */
adminRoutes.get(
  '/audit-logs',
  requestValidationMiddleware({
    querySchema: {
      type: 'object',
      properties: { targetType: { enum: Object.values(ADMIN_TARGETS) }, targetId: { type: 'string', maxLength: 64 }, ...page }
    }
  }),
  AdminController.listAuditLogs,
  responseValidationMiddleware({})
)

export default adminRoutes
