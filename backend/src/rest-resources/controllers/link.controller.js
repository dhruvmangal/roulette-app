import { ClaimDeferredLinkService } from '~/services/link'
import { sendResponse } from '~/utils/response.helpers'
import { catchAsync } from '~/utils/catchAsync.utils'

export default class LinkController {
  // req.ip honours TRUST_PROXY; a header like X-Client-IP could be made up by the client.
  static claimDeferred = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await ClaimDeferredLinkService.execute({ ip: req.ip, platform: req.body.platform }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })
}
