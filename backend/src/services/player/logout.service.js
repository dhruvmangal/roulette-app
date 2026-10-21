import { Op } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { hashTokenId, verifyRefreshToken } from '~/utils/auth.utils'
import { SUCCESS_MSG } from '~/utils/constants/success'

const constraints = ajv.compile({
  type: 'object',
  properties: { refreshToken: { type: 'string', minLength: 1, maxLength: 2048 } },
  required: ['refreshToken']
})

/**
 * Ends one login: its refresh token, and every token rotated from it, stop
 * working. The access token runs out within minutes. Always succeeds, so a
 * client can sign out even with a stale token.
 */
export class LogoutService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { refreshToken } = this.args
    const { dbModels: { PlayerSession } } = this.context

    let claims = null
    try {
      claims = verifyRefreshToken(refreshToken)
    } catch {
      // Expired or forged: nothing to revoke.
    }
    const session = claims?.sid && await PlayerSession.findOne({ where: { tokenHash: hashTokenId(claims.sid) } })
    if (session) {
      await PlayerSession.update({ revokedAt: new Date() }, { where: { familyId: session.familyId, revokedAt: { [Op.is]: null } } })
    }
    return { loggedOut: true, message: SUCCESS_MSG.LOGGED_OUT }
  }
}
