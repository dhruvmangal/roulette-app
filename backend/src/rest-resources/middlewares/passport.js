import passport from 'passport'
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt'
import config from '~/configs/app.config'
import models from '~/db/models'
import Logger from '~/libs/logger'
import { AuthenticatePlayerService } from '~/services/player'

/**
 * passport-jwt checks the token's signature and expiry; AuthenticatePlayer
 * then loads the player and rejects revoked tokens and banned or inactive
 * accounts. `req.user` becomes { playerId, username, isGuest }.
 */
export default function initPassport () {
  const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromExtractors([
      ExtractJwt.fromAuthHeaderAsBearerToken(),
      (req) => req?.cookies?.accessToken || null
    ]),
    secretOrKey: config.get('jwt.loginTokenSecret')
  }

  passport.use('jwt', new JwtStrategy(jwtOptions, async (claims, done) => {
    try {
      const { successful, result } = await AuthenticatePlayerService.execute({ claims }, { dbModels: models, logger: Logger })
      return done(null, successful ? result.player : false)
    } catch (error) {
      return done(error, false)
    }
  }))
}
