import models, { sequelize } from '~/db/models'
import Logger from '~/libs/logger'
import { evaluateAchievements } from '~/services/achievement'
import { ClaimBonusService, GetBonusesService } from '~/services/bonus'
import { sendResponse } from '~/utils/response.helpers'
import { catchAsync } from '~/utils/catchAsync.utils'

export default class BonusController {
  static getBonuses = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await GetBonusesService.execute({ playerId: req.user.playerId }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static claim = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await ClaimBonusService.execute(
      { playerId: req.user.playerId, code: req.params.code },
      req.context
    )
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })

    // A daily streak may have just earned an achievement. This request's transaction commits once the
    // response is out, and the wallet it holds locked is needed to pay the reward, so wait for the response
    // to finish and use a context of its own.
    if (successful && result.bonus.streakDay) {
      const { playerId } = req.user
      res.once('finish', () => {
        evaluateAchievements({ dbModels: models, sequelize, logger: Logger }, { playerIds: [playerId], groups: ['daily'], metrics: { dailyStreak: result.bonus.streakDay } })
      })
    }
  })
}
