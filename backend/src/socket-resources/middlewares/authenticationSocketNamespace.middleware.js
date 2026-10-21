import jwt from 'jsonwebtoken'
import config from '~/configs/app.config'
import models from '~/db/models'
import { TokenRequiredErrorType, InvalidTokenErrorType } from '~/utils/constants/errors'
import Logger from '~/libs/logger'
import { AuthenticatePlayerService } from '~/services/player'

/**
 * Namespace-level socket auth — apply with `namespace.use(...)` on any
 * namespace that needs a signed-in player. Verifies the access token, then
 * applies the same player checks as REST (see passport.js) and attaches
 * { playerId, username, isGuest } to `socket.user`.
 */
export default async function authenticationSocketNamespaceMiddleware (socket, next) {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.cookie?.split('accessToken=')[1]?.split(';')[0]

    if (!token) return next(TokenRequiredErrorType)

    const claims = jwt.verify(token, config.get('jwt.loginTokenSecret'))
    const { successful, result } = await AuthenticatePlayerService.execute({ claims }, { dbModels: models, logger: Logger })
    if (!successful) return next(InvalidTokenErrorType)

    socket.user = result.player

    next()
  } catch (err) {
    Logger.error('Error in authenticationSocketNamespaceMiddleware', {
      message: err.message,
      exception: err
    })
    next(InvalidTokenErrorType)
  }
}
