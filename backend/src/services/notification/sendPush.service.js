import ajv from '~/libs/ajv'
import { getApnsClient } from '~/libs/apns'
import { getFcmClient } from '~/libs/fcm'
import ServiceBase from '~/services/serviceBase'
import { NOTIFICATION_CATEGORY_LIST } from '~/utils/constants/notification.constants'
import { effectivePrefs } from '~/utils/notification.utils'
import { PUSH_TYPES, pushText } from '~/utils/pushMessages.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    category: { enum: NOTIFICATION_CATEGORY_LIST },
    type: { enum: Object.values(PUSH_TYPES) },
    // Words written by an admin, instead of a catalog message: the same in every language.
    custom: { type: 'object', properties: { title: { type: 'string', minLength: 1, maxLength: 80 }, body: { type: 'string', minLength: 1, maxLength: 240 } }, required: ['title', 'body'] },
    vars: { type: 'object' },
    // Opened by the app to go straight to what the notification is about.
    data: { type: 'object' },
    // Sending the same key twice sends once.
    dedupeKey: { type: 'string', minLength: 1, maxLength: 96 }
  },
  required: ['playerId', 'category']
})

/**
 * Internal: pushes a notification to every phone the player has registered,
 * if they want that kind and push is set up. Never throws for a delivery
 * problem: the caller gets how many phones were reached and, if none, why.
 */
export class SendPushService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, category, type, custom, vars = {}, data = {}, dedupeKey } = this.args
    if (!type && !custom) return this.addError('RequestInputValidationErrorType', 'a push needs a type or custom text')
    const { dbModels: { NotificationLog, Player, PushToken } } = this.context

    // Android phones are reached through Firebase, iPhones through Apple directly.
    const clients = { android: getFcmClient(), ios: getApnsClient() }
    if (!clients.android && !clients.ios) return { sent: 0, skipped: 'not-configured' }

    const player = await Player.findByPk(playerId, { attributes: ['playerId', 'status', 'notificationPrefs'] })
    if (!player || player.status !== 'active') return { sent: 0, skipped: 'no-player' }
    if (!effectivePrefs(player.notificationPrefs)[category]) return { sent: 0, skipped: 'opted-out' }

    const tokens = (await PushToken.findAll({ where: { playerId } })).filter(phone => clients[phone.platform])
    if (!tokens.length) return { sent: 0, skipped: 'no-devices' }

    // Written before sending: a crash can lose a notification but never send it twice.
    let log = null
    try {
      log = await NotificationLog.create({ playerId, category, dedupeKey: dedupeKey ?? null, devices: 0 })
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') return { sent: 0, skipped: 'duplicate' }
      throw error
    }

    let sent = 0
    for (const phone of tokens) {
      try {
        const result = await clients[phone.platform].send(phone.token, { ...(custom ?? pushText(type, phone.language, vars)), data: { type: custom ? 'announcement' : type, ...data } })
        if (result.ok) sent++
        else if (result.reason === 'dead-token') await phone.destroy()
        else this.log.error('Push was not delivered', { playerId, reason: result.reason, status: result.status })
      } catch (exception) {
        this.log.error('Push failed', { playerId, exception })
      }
    }
    await log.update({ devices: sent })
    return { sent }
  }
}
