import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { effectivePrefs } from '~/utils/notification.utils'

const constraints = ajv.compile({ type: 'object', properties: { playerId: { type: 'integer', minimum: 1 } }, required: ['playerId'] })

/** Which kinds of notification the player wants, and how many phones are set up to get them. */
export class GetNotificationSettingsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId } = this.args
    const { dbModels: { Player, PushToken } } = this.context
    const player = await Player.findByPk(playerId, { attributes: ['playerId', 'notificationPrefs'] })
    if (!player) return this.addError('UserNotExistsErrorType', '')
    const devices = await PushToken.count({ where: { playerId } })
    return { prefs: effectivePrefs(player.notificationPrefs), devices, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
