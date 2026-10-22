import ServiceBase from '~/services/serviceBase'
import { readAds, SETTING_KEYS } from '~/utils/appSettings.utils'
import { SUCCESS_MSG } from '~/utils/constants/success'

/** Whether ads between rounds are on for the website and for the mobile app. */
export class GetAdsSettingsService extends ServiceBase {
  async run () {
    const { dbModels: { AppSetting } } = this.context
    const row = await AppSetting.findByPk(SETTING_KEYS.ADS)
    return { ads: readAds(row), updatedAt: row?.updatedAt ?? null, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
