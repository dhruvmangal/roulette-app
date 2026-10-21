import { GetLeaderboardService, GetPlayerHistoryService, GetPlayerStatsService, ListMyTablesService } from '~/services/game'
import { GetProfileService, RecordDeviceService } from '~/services/player'
import { sendResponse } from '~/utils/response.helpers'
import { catchAsync } from '~/utils/catchAsync.utils'

export default class PlayerController {
  static getMe = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await GetProfileService.execute({ playerId: req.user.playerId }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static recordDevice = catchAsync(async (req, res, next) => {
    // req.ip honours TRUST_PROXY; headers like X-Client-IP could be forged by the client.
    const { result, successful, errors } = await RecordDeviceService.execute(
      { ...req.body, playerId: req.user.playerId, ip: req.ip, userAgent: req.get('user-agent') ?? null },
      req.context
    )
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static getHistory = catchAsync(async (req, res, next) => {
    const { limit, pageNo } = req.query
    const { result, successful, errors } = await GetPlayerHistoryService.execute({ playerId: req.user.playerId, limit, pageNo }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static getStats = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await GetPlayerStatsService.execute(
      { playerId: req.user.playerId, period: req.query.period || 'month', timeZone: req.query.tz ?? null },
      req.context
    )
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static getTables = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await ListMyTablesService.execute({ playerId: req.user.playerId }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static getLeaderboard = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await GetLeaderboardService.execute(
      { playerId: req.user.playerId, period: req.query.period || 'week' },
      req.context
    )
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })
}
