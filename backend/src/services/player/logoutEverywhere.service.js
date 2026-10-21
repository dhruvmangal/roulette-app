import { Op } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: { playerId: { type: 'integer', minimum: 1 } },
  required: ['playerId']
})

/**
 * Signs the player out on every device at once: bumping tokenVersion voids
 * every access token immediately, and every refresh token is revoked.
 */
export class LogoutEverywhereService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId } = this.args
    const { dbModels: { Player, PlayerSession } } = this.context

    return withTransaction(this, async (transaction) => {
      const player = await Player.findByPk(playerId, { lock: transaction.LOCK.UPDATE, transaction })
      if (!player) return this.addError('UserNotExistsErrorType', '')
      await player.update({ tokenVersion: player.tokenVersion + 1 }, { transaction })
      await PlayerSession.update({ revokedAt: new Date() }, { where: { playerId, revokedAt: { [Op.is]: null } }, transaction })
      return { loggedOut: true, message: SUCCESS_MSG.LOGGED_OUT }
    })
  }
}
