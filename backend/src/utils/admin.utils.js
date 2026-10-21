import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import jwt from 'jsonwebtoken'
import config from '~/configs/app.config'
import { ADMIN_TOKEN_TYPE } from '~/utils/constants/admin.constants'

/**
 * Auth building blocks for the admin app (src/services/admin). Passwords use
 * Node's built-in scrypt, so no hashing dependency is needed.
 */

const scryptAsync = promisify(scrypt)
const KEY_LENGTH = 64

export const hashPassword = async (password) => {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, KEY_LENGTH)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

export const verifyPassword = async (password, stored) => {
  const [saltHex, keyHex] = (stored || '').split(':')
  if (!saltHex || !keyHex) return false
  const expected = Buffer.from(keyHex, 'hex')
  const key = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(key, expected)
}

/**
 * The admin signing secret, or null while the admin app is off. It must differ
 * from both player secrets, so a player token can never pass as an admin's.
 */
export const adminSecret = () => {
  const secret = config.get('admin.tokenSecret')
  if (!secret) return null
  if (secret === config.get('jwt.loginTokenSecret') || secret === config.get('jwt.refreshTokenSecret')) return null
  return secret
}

export const signAdminToken = ({ adminUserId, tokenVersion }) => {
  return jwt.sign({ adminUserId, tokenVersion, type: ADMIN_TOKEN_TYPE }, adminSecret(), {
    expiresIn: config.get('admin.tokenExpiry')
  })
}

/** The token's claims, or null if it is not a valid admin token. */
export const verifyAdminToken = (token) => {
  const secret = adminSecret()
  if (!secret || !token) return null
  try {
    const claims = jwt.verify(token, secret)
    return claims?.type === ADMIN_TOKEN_TYPE && Number.isInteger(claims.adminUserId) ? claims : null
  } catch {
    return null
  }
}

export const toAdminView = (admin) => ({
  adminUserId: admin.adminUserId,
  email: admin.email,
  name: admin.name,
  lastLoginAt: admin.lastLoginAt ?? null
})

/** Records an admin's change in the audit log, inside the change's own transaction. */
export const recordAudit = (context, transaction, { action, targetType = null, targetId = null, details = {} }) => {
  const { dbModels: { AdminAuditLog }, admin } = context
  return AdminAuditLog.create({
    adminUserId: admin.adminUserId,
    action,
    targetType,
    targetId: targetId === null ? null : String(targetId),
    details
  }, { transaction })
}
