import ServiceBase from '~/services/serviceBase'
import { readAds, SETTING_KEYS } from '~/utils/appSettings.utils'
import { SUCCESS_MSG } from '~/utils/constants/success'

/** The switches the web and mobile apps read when they start, so an admin can change them without a release. */
export class GetPublicConfigService extends ServiceBase {
  async run () {
    const { dbModels: { AppSetting } } = this.context
    const ads = readAds(await AppSetting.findByPk(SETTING_KEYS.ADS))
    return { config: { ads }, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
