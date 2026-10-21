import passport from 'passport'
import { UnAuthorizeUserErrorType } from '~/utils/constants/errors'

/**
 * Requires a valid access token for an active player (see passport.js) and
 * attaches { playerId, username, isGuest } to `req.user`.
 */
export function isAuthenticated (req, res, next) {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (err || !user) {
      return next(UnAuthorizeUserErrorType)
    }

    req.user = user
    next()
  })(req, res, next)
}
