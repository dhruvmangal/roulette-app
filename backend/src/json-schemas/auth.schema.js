import ajv from '~/libs/ajv'
import { providerTokenSchema } from '~/services/player/signInWithProvider.service'

/** @type {import("ajv").Schema} */
const refreshToken = {
  type: 'object',
  properties: {
    refreshToken: { type: 'string', minLength: 1, maxLength: 2048 }
  },
  required: ['refreshToken']
}

ajv.addSchema(providerTokenSchema, '/providerToken.json')
ajv.addSchema(refreshToken, '/refreshToken.json')
ajv.addSchema({ type: 'object', properties: { code: { type: 'string', minLength: 10, maxLength: 512 } }, required: ['code'] }, '/discordCode.json')

/** @type {import("ajv").Schema} What the app reports about the device it runs on. */
const recordDevice = {
  type: 'object',
  properties: {
    deviceId: { type: 'string', pattern: '^[A-Za-z0-9-]{16,64}$' },
    platform: { enum: ['web', 'ios', 'android'] },
    native: {
      type: 'object',
      properties: {
        manufacturer: { type: 'string', maxLength: 64 },
        model: { type: 'string', maxLength: 64 },
        osVersion: { type: 'string', maxLength: 32 },
        isVirtual: { type: 'boolean' }
      }
    },
    appVersion: { type: 'string', maxLength: 32 },
    screenWidth: { type: 'integer', minimum: 0, maximum: 100000 },
    screenHeight: { type: 'integer', minimum: 0, maximum: 100000 },
    pixelRatio: { type: 'number', minimum: 0, maximum: 10 },
    language: { type: 'string', maxLength: 35 },
    timezone: { type: 'string', maxLength: 64 },
    orientation: { type: 'string', maxLength: 32 },
    networkType: { type: 'string', maxLength: 16 },
    networkQuality: { type: 'string', maxLength: 16 }
  },
  required: ['deviceId', 'platform']
}

ajv.addSchema(recordDevice, '/recordDevice.json')
