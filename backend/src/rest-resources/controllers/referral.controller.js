import { ClaimReferralService, GetReferralsService } from '~/services/referral'
import { sendResponse } from '~/utils/response.helpers'
import { catchAsync } from '~/utils/catchAsync.utils'

export default class ReferralController {
  static getMine = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await GetReferralsService.execute({ playerId: req.user.playerId }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static claim = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await ClaimReferralService.execute({ playerId: req.user.playerId, code: req.body.code }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })
}
