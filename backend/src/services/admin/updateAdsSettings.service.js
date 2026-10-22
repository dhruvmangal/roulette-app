import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { readAds, SETTING_KEYS } from '~/utils/appSettings.utils'
import { recordAudit } from '~/utils/admin.utils'
import { ADMIN_ACTIONS, ADMIN_TARGETS } from '~/utils/constants/admin.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: { web: { type: 'boolean' }, app: { type: 'boolean' } },
  anyOf: [{ required: ['web'] }, { required: ['app'] }]
})

/** Turns ads between rounds on or off for the website, the mobile app, or both. Apps pick it up on their next start. */
export class UpdateAdsSettingsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { dbModels: { AppSetting } } = this.context

    return withTransaction(this, async (transaction) => {
      const row = await AppSetting.findByPk(SETTING_KEYS.ADS, { lock: transaction.LOCK.UPDATE, transaction })
      const before = readAds(row)
      const after = { ...before, ...this.args }
      if (row) await row.update({ value: after }, { transaction })
      else await AppSetting.create({ key: SETTING_KEYS.ADS, value: after }, { transaction })

      await recordAudit(this.context, transaction, {
        action: ADMIN_ACTIONS.SETTINGS_UPDATE,
        targetType: ADMIN_TARGETS.SETTING,
        targetId: SETTING_KEYS.ADS,
        details: { before, after }
      })
      return { ads: after, message: SUCCESS_MSG.UPDATE_SUCCESS }
    })
  }
}
