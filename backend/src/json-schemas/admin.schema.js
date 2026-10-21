import ajv from '~/libs/ajv'
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_LIMITS } from '~/utils/constants/notification.constants'
import { PLAYER_STATUS } from '~/utils/constants/player.constants'
import { WALLET_DIRECTIONS } from '~/utils/constants/wallet.constants'

/** @type {import("ajv").Schema} */
const adminLogin = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email', maxLength: 254 },
    password: { type: 'string', minLength: 1, maxLength: 200 }
  },
  required: ['email', 'password']
}

/** @type {import("ajv").Schema} */
const adminSetPlayerStatus = {
  type: 'object',
  properties: {
    status: { enum: Object.values(PLAYER_STATUS) },
    reason: { type: 'string', minLength: 3, maxLength: 500 }
  },
  required: ['status', 'reason']
}

/** @type {import("ajv").Schema} */
const adminAdjustWallet = {
  type: 'object',
  properties: {
    direction: { enum: Object.values(WALLET_DIRECTIONS) },
    amount: { type: 'integer', minimum: 1, maximum: 1e9 },
    reason: { type: 'string', minLength: 3, maxLength: 500 },
    requestId: { type: 'string', minLength: 8, maxLength: 64 }
  },
  required: ['direction', 'amount', 'reason', 'requestId']
}

/** @type {import("ajv").Schema} */
const adminUpdateBonus = {
  type: 'object',
  properties: {
    amount: { type: 'integer', minimum: 1, maximum: 1e9 },
    cooldownSeconds: { type: ['integer', 'null'], minimum: 0 },
    maxClaims: { type: ['integer', 'null'], minimum: 1 },
    minBalanceThreshold: { type: ['integer', 'null'], minimum: 0 },
    isActive: { type: 'boolean' }
  },
  minProperties: 1
}

/** @type {import("ajv").Schema} A push notification to send from the admin app. */
const adminSendAnnouncement = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: ANNOUNCEMENT_LIMITS.title },
    body: { type: 'string', minLength: 1, maxLength: ANNOUNCEMENT_LIMITS.body },
    audience: { enum: Object.values(ANNOUNCEMENT_AUDIENCES) },
    days: { type: 'integer', minimum: ANNOUNCEMENT_LIMITS.inactiveDays.min, maximum: ANNOUNCEMENT_LIMITS.inactiveDays.max },
    playerId: { type: 'integer', minimum: 1 },
    requestId: { type: 'string', minLength: 8, maxLength: 64 }
  },
  required: ['title', 'body', 'audience', 'requestId'],
  additionalProperties: false
}

ajv.addSchema(adminLogin, '/adminLogin.json')
ajv.addSchema(adminSendAnnouncement, '/adminSendAnnouncement.json')
ajv.addSchema(adminSetPlayerStatus, '/adminSetPlayerStatus.json')
ajv.addSchema(adminAdjustWallet, '/adminAdjustWallet.json')
ajv.addSchema(adminUpdateBonus, '/adminUpdateBonus.json')
