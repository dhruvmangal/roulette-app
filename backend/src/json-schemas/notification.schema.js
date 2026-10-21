import ajv from '~/libs/ajv'
import { NOTIFICATION_CATEGORY_LIST, PUSH_PLATFORMS } from '~/utils/constants/notification.constants'

/** @type {import("ajv").Schema} A phone's push token, sent by the app after the player allows notifications. */
const registerPushToken = {
  type: 'object',
  properties: {
    token: { type: 'string', minLength: 20, maxLength: 512 },
    platform: { enum: PUSH_PLATFORMS },
    deviceId: { type: 'string', pattern: '^[A-Za-z0-9-]{16,64}$' },
    appVersion: { type: 'string', maxLength: 32 },
    language: { type: 'string', maxLength: 8 }
  },
  required: ['token', 'platform'],
  additionalProperties: false
}

/** @type {import("ajv").Schema} */
const unregisterPushToken = {
  type: 'object',
  properties: { token: { type: 'string', minLength: 20, maxLength: 512 } },
  required: ['token'],
  additionalProperties: false
}

/** @type {import("ajv").Schema} Which kinds of notification to switch on or off. */
const notificationSettings = {
  type: 'object',
  properties: {
    prefs: { type: 'object', additionalProperties: false, properties: Object.fromEntries(NOTIFICATION_CATEGORY_LIST.map(name => [name, { type: 'boolean' }])) }
  },
  required: ['prefs'],
  additionalProperties: false
}

ajv.addSchema(registerPushToken, '/registerPushToken.json')
ajv.addSchema(unregisterPushToken, '/unregisterPushToken.json')
ajv.addSchema(notificationSettings, '/notificationSettings.json')
