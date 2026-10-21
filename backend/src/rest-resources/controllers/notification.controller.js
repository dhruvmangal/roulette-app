import {
  GetNotificationSettingsService, RegisterPushTokenService, UnregisterPushTokenService, UpdateNotificationSettingsService
} from '~/services/notification'
import { sendResponse } from '~/utils/response.helpers'
import { catchAsync } from '~/utils/catchAsync.utils'

const respond = (Service, argsFrom) => catchAsync(async (req, res, next) => {
  const { result, successful, errors } = await Service.execute({ playerId: req.user.playerId, ...argsFrom(req) }, req.context)
  sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
})

export default class NotificationController {
  static getSettings = respond(GetNotificationSettingsService, () => ({}))
  static updateSettings = respond(UpdateNotificationSettingsService, (req) => ({ prefs: req.body.prefs }))
  static registerToken = respond(RegisterPushTokenService, (req) => req.body)
  static unregisterToken = respond(UnregisterPushTokenService, (req) => ({ token: req.body.token }))
}
