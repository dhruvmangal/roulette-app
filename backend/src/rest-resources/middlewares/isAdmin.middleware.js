import { AuthenticateAdminService } from '~/services/admin'
import { AdminUnauthorizedErrorType } from '~/utils/constants/errors'

/**
 * Requires an admin app token (Authorization: Bearer ...) for an active
 * admin and puts the admin on `req.context.admin`. Player tokens are signed
 * with a different secret and never pass. Header only, never a cookie, so
 * no other site can make an admin's browser send it.
 */
export async function isAdmin (req, res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || '').split(' ')
    const { successful, result } = await AuthenticateAdminService.execute(
      { token: scheme === 'Bearer' ? token : null },
      req.context
    )
    if (!successful) return next(AdminUnauthorizedErrorType)

    req.context.admin = result.admin
    next()
  } catch (error) {
    next(error)
  }
}
