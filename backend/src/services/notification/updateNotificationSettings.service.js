import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { NOTIFICATION_CATEGORY_LIST } from '~/utils/constants/notification.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { effectivePrefs } from '~/utils/notification.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    prefs: { type: 'object', additionalProperties: false, properties: Object.fromEntries(NOTIFICATION_CATEGORY_LIST.map(name => [name, { type: 'boolean' }])) }
  },
  required: ['playerId', 'prefs']
})

/** Switches kinds of notification on or off; only the ones given change. */
export class UpdateNotificationSettingsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, prefs } = this.args
    const { dbModels: { Player, PushToken } } = this.context
    const player = await Player.findByPk(playerId)
    if (!player) return this.addError('UserNotExistsErrorType', '')
    const merged = effectivePrefs({ ...player.notificationPrefs, ...prefs })
    await player.update({ notificationPrefs: merged })
    const devices = await PushToken.count({ where: { playerId } })
    return { prefs: merged, devices, message: SUCCESS_MSG.UPDATE_SUCCESS }
  }
}
