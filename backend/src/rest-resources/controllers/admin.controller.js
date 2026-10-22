import {
  AdjustWalletService,
  AdminLoginService,
  AdminLogoutService,
  ForcePlayerLogoutService,
  GetAdsSettingsService,
  GetAnnouncementReachService,
  GetDashboardStatsService,
  GetPlayerDetailService,
  ListAnnouncementsService,
  ListAuditLogsService,
  ListBonusesService,
  ListChatReportsService,
  ListPlayersService,
  ListReferralsService,
  ListRoomsService,
  ListTransactionsService,
  SendAnnouncementService,
  SetPlayerStatusService,
  UpdateAdsSettingsService,
  UpdateBonusService
} from '~/services/admin'
import { sendResponse } from '~/utils/response.helpers'
import { catchAsync } from '~/utils/catchAsync.utils'

// Query strings arrive as text; the services validate numbers as numbers.
const toInt = (value) => (value === undefined || value === '' ? undefined : Number(value))

const respond = (Service, argsFrom) => catchAsync(async (req, res, next) => {
  const { result, successful, errors } = await Service.execute(argsFrom(req), req.context)
  sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
})

export default class AdminController {
  static login = respond(AdminLoginService, (req) => ({ email: req.body.email, password: req.body.password }))

  static me = catchAsync(async (req, res, next) => {
    sendResponse({ req, res, next }, { result: { admin: req.context.admin }, successful: true })
  })

  static logout = respond(AdminLogoutService, () => ({}))

  static stats = respond(GetDashboardStatsService, (req) => ({ days: toInt(req.query.days) }))

  static listPlayers = respond(ListPlayersService, (req) => {
    const { search, status, kind, sort, limit, pageNo } = req.query
    return { search, status, kind, sort, limit, pageNo }
  })

  static getPlayer = respond(GetPlayerDetailService, (req) => ({ playerId: toInt(req.params.playerId) }))

  static setPlayerStatus = respond(SetPlayerStatusService, (req) => ({
    playerId: toInt(req.params.playerId),
    status: req.body.status,
    reason: req.body.reason
  }))

  static forcePlayerLogout = respond(ForcePlayerLogoutService, (req) => ({ playerId: toInt(req.params.playerId) }))

  static adjustWallet = respond(AdjustWalletService, (req) => ({
    playerId: toInt(req.params.playerId),
    direction: req.body.direction,
    amount: req.body.amount,
    reason: req.body.reason,
    requestId: req.body.requestId
  }))

  static listTransactions = respond(ListTransactionsService, (req) => {
    const { playerId, type, direction, minAmount, from, to, limit, pageNo } = req.query
    return { playerId: toInt(playerId), type, direction, minAmount: toInt(minAmount), from, to, limit, pageNo }
  })

  static listBonuses = respond(ListBonusesService, () => ({}))

  static getAdsSettings = respond(GetAdsSettingsService, () => ({}))

  static updateAdsSettings = respond(UpdateAdsSettingsService, (req) => req.body)

  static updateBonus = respond(UpdateBonusService, (req) => ({ ...req.body, bonusId: toInt(req.params.bonusId) }))

  static listRooms = respond(ListRoomsService, (req) => {
    const { status, mode, limit, pageNo } = req.query
    return { status, mode, limit, pageNo }
  })

  static listChatReports = respond(ListChatReportsService, (req) => ({ limit: req.query.limit, pageNo: req.query.pageNo }))

  static listReferrals = respond(ListReferralsService, (req) => ({
    status: req.query.status,
    playerId: toInt(req.query.playerId),
    limit: req.query.limit,
    pageNo: req.query.pageNo
  }))

  static listAnnouncements = respond(ListAnnouncementsService, (req) => ({ limit: req.query.limit, pageNo: req.query.pageNo }))

  static announcementReach = respond(GetAnnouncementReachService, (req) => ({
    audience: req.query.audience,
    days: req.query.days === undefined ? null : toInt(req.query.days),
    playerId: req.query.playerId === undefined ? null : toInt(req.query.playerId)
  }))

  static sendAnnouncement = respond(SendAnnouncementService, (req) => req.body)

  static listAuditLogs = respond(ListAuditLogsService, (req) => {
    const { targetType, targetId, limit, pageNo } = req.query
    return { targetType, targetId, limit, pageNo }
  })
}
