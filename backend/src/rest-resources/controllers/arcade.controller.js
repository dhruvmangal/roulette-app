import { CashOutCrashService, GetActiveCrashService, GetArcadeHistoryService, PlayArcadeService, StartCrashService } from '~/services/arcade'
import { sendResponse } from '~/utils/response.helpers'
import { catchAsync } from '~/utils/catchAsync.utils'

export default class ArcadeController {
  static playPlinko = catchAsync(async (req, res, next) => {
    const { stake, rows, risk, requestId } = req.body
    const { result, successful, errors } = await PlayArcadeService.execute({ playerId: req.user.playerId, game: 'PLINKO', stake, rows, risk, requestId }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static playWheel = catchAsync(async (req, res, next) => {
    const { stake, risk, requestId } = req.body
    const { result, successful, errors } = await PlayArcadeService.execute({ playerId: req.user.playerId, game: 'WHEEL', stake, risk, requestId }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static playHorses = catchAsync(async (req, res, next) => {
    const { bets, requestId } = req.body
    const { result, successful, errors } = await PlayArcadeService.execute({ playerId: req.user.playerId, game: 'HORSES', bets, requestId }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static startCrash = catchAsync(async (req, res, next) => {
    const { game, bets, requestId } = req.body
    const { result, successful, errors } = await StartCrashService.execute({ playerId: req.user.playerId, game, bets, requestId }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static cashOutCrash = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await CashOutCrashService.execute({
      playerId: req.user.playerId,
      arcadeRoundId: Number(req.params.arcadeRoundId),
      slot: req.body.slot
    }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static getActiveCrash = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await GetActiveCrashService.execute({ playerId: req.user.playerId, game: req.query.game }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static getHistory = catchAsync(async (req, res, next) => {
    const { game, limit } = req.query
    const { result, successful, errors } = await GetArcadeHistoryService.execute({ playerId: req.user.playerId, game, ...(limit && { limit: Number(limit) }) }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })
}
