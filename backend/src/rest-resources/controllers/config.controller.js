import { GetPublicConfigService } from '~/services/config'
import { sendResponse } from '~/utils/response.helpers'
import { catchAsync } from '~/utils/catchAsync.utils'

export default class ConfigController {
  static get = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await GetPublicConfigService.execute({}, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })
}
