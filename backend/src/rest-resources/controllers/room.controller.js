import {
  CreateRoomService, GetRoomStateService, JoinDiscordTableService, JoinRoomService, LeaveRoomService, ListPublicRoomsService, QuickMatchService
} from '~/services/game'
import { sendResponse } from '~/utils/response.helpers'
import { catchAsync } from '~/utils/catchAsync.utils'

export default class RoomController {
  static listPublic = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await ListPublicRoomsService.execute({ variant: req.query.variant }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static create = catchAsync(async (req, res, next) => {
    const { variant, mode, bots, totalRounds, bettingSeconds, minBet, maxBet } = req.body
    const { result, successful, errors } = await CreateRoomService.execute(
      { playerId: req.user.playerId, variant, mode, bots, totalRounds, bettingSeconds, minBet, maxBet },
      req.context
    )
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static quickMatch = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await QuickMatchService.execute({ playerId: req.user.playerId, variant: req.body.variant }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static joinDiscord = catchAsync(async (req, res, next) => {
    const { instanceId, variant } = req.body
    const { result, successful, errors } = await JoinDiscordTableService.execute({ playerId: req.user.playerId, instanceId, variant }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static join = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await JoinRoomService.execute({ playerId: req.user.playerId, code: req.body.code }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static getState = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await GetRoomStateService.execute(
      { roomId: Number(req.params.roomId), playerId: req.user.playerId },
      req.context
    )
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static leave = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await LeaveRoomService.execute(
      { roomId: Number(req.params.roomId), playerId: req.user.playerId },
      req.context
    )
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })
}
