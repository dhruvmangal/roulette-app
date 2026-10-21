import ajv from '~/libs/ajv'
import { getApnsClient } from '~/libs/apns'
import { getFcmClient } from '~/libs/fcm'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_LIMITS } from '~/utils/constants/notification.constants'
import { audienceReach, whyUnreachable } from '~/utils/announcement.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    audience: { enum: Object.values(ANNOUNCEMENT_AUDIENCES) },
    days: { type: ['integer', 'null'], minimum: ANNOUNCEMENT_LIMITS.inactiveDays.min, maximum: ANNOUNCEMENT_LIMITS.inactiveDays.max },
    playerId: { type: ['integer', 'null'], minimum: 1 }
  },
  required: ['audience']
})

/**
 * Who an announcement would reach, before it is sent: players, phones, and
 * whether push is set up on this server at all. For one player it also says
 * why they can't be reached, if that is so.
 */
export class GetAnnouncementReachService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { audience, days = null, playerId = null } = this.args
    const { sequelize } = this.context

    if (audience === ANNOUNCEMENT_AUDIENCES.INACTIVE && !days) return this.addError('RequestInputValidationErrorType', 'days is needed for this audience')
    if (audience === ANNOUNCEMENT_AUDIENCES.PLAYER && !playerId) return this.addError('RequestInputValidationErrorType', 'playerId is needed for this audience')

    const reach = await audienceReach(sequelize, { audience, days, playerId })
    return {
      ...reach,
      unreachable: audience === ANNOUNCEMENT_AUDIENCES.PLAYER && !reach.players ? await whyUnreachable(sequelize, playerId) : null,
      configured: { android: Boolean(getFcmClient()), ios: Boolean(getApnsClient()) },
      message: SUCCESS_MSG.GET_SUCCESS
    }
  }
}
