import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { adminSecret, signAdminToken, toAdminView, verifyPassword } from '~/utils/admin.utils'
import { ADMIN_STATUS } from '~/utils/constants/admin.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { sameIgnoringCase } from '~/utils/player.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    email: { type: 'string', minLength: 3, maxLength: 254 },
    password: { type: 'string', minLength: 1, maxLength: 200 }
  },
  required: ['email', 'password']
})

// Checked against when the email is unknown, so a miss takes as long as a wrong password.
const DUMMY_HASH = '00000000000000000000000000000000:' + '00'.repeat(64)

/** Email and password sign-in for the admin app. */
export class AdminLoginService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { email, password } = this.args
    const { dbModels: { AdminUser } } = this.context

    if (!adminSecret()) return this.addError('AdminNotConfiguredErrorType', '')

    const admin = await AdminUser.findOne({ where: sameIgnoringCase('email', email.trim()) })
    const matches = await verifyPassword(password, admin?.passwordHash ?? DUMMY_HASH)
    if (!admin || !matches || admin.status !== ADMIN_STATUS.ACTIVE) return this.addError('AdminLoginFailedErrorType', '')

    await admin.update({ lastLoginAt: new Date() })
    return { admin: toAdminView(admin), accessToken: signAdminToken(admin), message: SUCCESS_MSG.LOGIN_SUCCESS }
  }
}
