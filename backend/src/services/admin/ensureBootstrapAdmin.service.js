import config from '~/configs/app.config'
import ServiceBase from '~/services/serviceBase'
import { hashPassword } from '~/utils/admin.utils'
import { sameIgnoringCase } from '~/utils/player.utils'

const MIN_PASSWORD_LENGTH = 10

/**
 * Run at startup: creates the admin named by ADMIN_BOOTSTRAP_EMAIL and
 * ADMIN_BOOTSTRAP_PASSWORD if there is none with that email. It never changes
 * an existing admin, so the password can be rotated in the app's database.
 */
export class EnsureBootstrapAdminService extends ServiceBase {
  async run () {
    const { dbModels: { AdminUser } } = this.context
    const email = config.get('admin.bootstrapEmail').trim()
    const password = config.get('admin.bootstrapPassword')

    if (!email || !password) return { created: false }
    if (password.length < MIN_PASSWORD_LENGTH) {
      this.log.error('EnsureBootstrapAdmin', { message: `ADMIN_BOOTSTRAP_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters; no admin created` })
      return { created: false }
    }

    const existing = await AdminUser.findOne({ where: sameIgnoringCase('email', email) })
    if (existing) return { created: false }

    await AdminUser.create({ email, name: email.split('@')[0], passwordHash: await hashPassword(password) })
    this.log.info('EnsureBootstrapAdmin', { message: `Created admin ${email}` })
    return { created: true }
  }
}
