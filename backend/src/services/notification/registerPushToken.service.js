import { Op } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { MAX_PUSH_TOKENS_PER_PLAYER, PUSH_LANGUAGES, PUSH_PLATFORMS } from '~/utils/constants/notification.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    token: { type: 'string', minLength: 20, maxLength: 512 },
    platform: { enum: PUSH_PLATFORMS },
    deviceId: { type: ['string', 'null'], maxLength: 64 },
    appVersion: { type: ['string', 'null'], maxLength: 32 },
    language: { type: ['string', 'null'], maxLength: 8 }
  },
  required: ['playerId', 'token', 'platform']
})

/**
 * Saves the phone's push token for the signed-in player. A token belongs to
 * one phone, so if another player signed in there before, it moves to this
 * one: the earlier player stops getting this phone's notifications.
 */
export class RegisterPushTokenService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, token, platform, deviceId = null, appVersion = null } = this.args
    const language = PUSH_LANGUAGES.includes(this.args.language) ? this.args.language : 'en'
    const { dbModels: { PushToken } } = this.context

    return withTransaction(this, async (transaction) => {
      const now = new Date()
      const existing = await PushToken.findOne({ where: { token }, transaction })
      if (existing) await existing.update({ playerId, platform, deviceId, appVersion, language, lastSeenAt: now }, { transaction })
      else await PushToken.create({ playerId, token, platform, deviceId, appVersion, language, lastSeenAt: now }, { transaction })

      // Keep the phones a player has most recently used.
      const mine = await PushToken.findAll({ where: { playerId }, order: [['lastSeenAt', 'DESC'], ['pushTokenId', 'DESC']], transaction })
      const stale = mine.slice(MAX_PUSH_TOKENS_PER_PLAYER).map(row => row.pushTokenId)
      if (stale.length) await PushToken.destroy({ where: { pushTokenId: { [Op.in]: stale } }, transaction })

      return { registered: true, message: SUCCESS_MSG.CREATE_SUCCESS }
    })
  }
}
