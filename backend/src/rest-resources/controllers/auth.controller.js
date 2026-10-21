import {
  GetAuthProvidersService, GuestLoginService, LinkProviderService, LogoutEverywhereService, LogoutService, RefreshTokenService, SignInWithDiscordService, SignInWithProviderService
} from '~/services/player'
import { sendResponse } from '~/utils/response.helpers'
import { catchAsync } from '~/utils/catchAsync.utils'

export default class AuthController {
  static signInWithProvider = catchAsync(async (req, res, next) => {
    const { idToken, nonce, name } = req.body
    const { result, successful, errors } = await SignInWithProviderService.execute({ provider: req.params.provider, idToken, nonce, name }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static signInWithDiscord = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await SignInWithDiscordService.execute({ code: req.body.code }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static linkProvider = catchAsync(async (req, res, next) => {
    const { idToken, nonce, name } = req.body
    const { result, successful, errors } = await LinkProviderService.execute(
      { playerId: req.user.playerId, provider: req.params.provider, idToken, nonce, name },
      req.context
    )
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static providers = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await GetAuthProvidersService.execute({}, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static guest = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await GuestLoginService.execute({}, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static refresh = catchAsync(async (req, res, next) => {
    const { refreshToken } = req.body
    const { result, successful, errors } = await RefreshTokenService.execute({ refreshToken }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static logout = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await LogoutService.execute({ refreshToken: req.body.refreshToken }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static logoutEverywhere = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await LogoutEverywhereService.execute({ playerId: req.user.playerId }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })
}
