import { GetAchievementsService } from '~/services/achievement'
import { sendResponse } from '~/utils/response.helpers'
import { catchAsync } from '~/utils/catchAsync.utils'

export default class AchievementController {
  static getMine = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await GetAchievementsService.execute({ playerId: req.user.playerId }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })
}
