import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'

/** Revokes every token the admin holds (admin sessions are not tracked one by one). */
export class AdminLogoutService extends ServiceBase {
  async run () {
    const { dbModels: { AdminUser }, admin } = this.context

    await AdminUser.increment('tokenVersion', { where: { adminUserId: admin.adminUserId } })
    return { loggedOut: true, message: SUCCESS_MSG.LOGGED_OUT }
  }
}
