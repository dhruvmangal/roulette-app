import { createHash, randomBytes } from 'crypto'
import jwt from 'jsonwebtoken'
import config from '~/configs/app.config'

/**
 * Auth building blocks used by the player services (src/services/player).
 */

export const signAccessToken = (payload, { expiresIn } = {}) => {
  return jwt.sign(payload, config.get('jwt.loginTokenSecret'), {
    expiresIn: expiresIn || config.get('jwt.loginTokenExpiry')
  })
}

export const verifyAccessToken = (token) => {
  return jwt.verify(token, config.get('jwt.loginTokenSecret'))
}

const refreshSecret = () => {
  const secret = config.get('jwt.refreshTokenSecret')
  // A shared secret would let a leaked access token be turned into a refresh token, or back.
  if (!secret || secret === config.get('jwt.loginTokenSecret')) {
    throw new Error('JWT_REFRESH_SECRET must be set, and differ from JWT_LOGIN_SECRET')
  }
  return secret
}

export const signRefreshToken = (payload) => {
  return jwt.sign(payload, refreshSecret(), { expiresIn: config.get('jwt.refreshTokenExpiry') })
}

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, refreshSecret())
}

/** A random id for a refresh token; the database keeps only its hash. */
export const newTokenId = () => randomBytes(32).toString('base64url')

export const hashTokenId = (tokenId) => createHash('sha256').update(tokenId).digest('hex')
