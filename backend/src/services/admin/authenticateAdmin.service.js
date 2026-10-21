import ServiceBase from '~/services/serviceBase'
import { toAdminView, verifyAdminToken } from '~/utils/admin.utils'
import { ADMIN_STATUS } from '~/utils/constants/admin.constants'

/**
 * Turns a bearer token into the signed-in admin, rejecting tokens that are
 * revoked (logged out) or belong to a disabled admin.
 */
export class AuthenticateAdminService extends ServiceBase {
  async run () {
    const { token } = this.args
    const { dbModels: { AdminUser } } = this.context

    const claims = verifyAdminToken(token)
    if (!claims) return this.addError('AdminUnauthorizedErrorType', '')

    const admin = await AdminUser.findByPk(claims.adminUserId)
    if (!admin || admin.tokenVersion !== claims.tokenVersion || admin.status !== ADMIN_STATUS.ACTIVE) {
      return this.addError('AdminUnauthorizedErrorType', '')
    }

    return { admin: toAdminView(admin) }
  }
}
