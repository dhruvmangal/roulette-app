import { Op } from 'sequelize'
import ajv from '~/libs/ajv'
import socketEmitter from '~/libs/socketEmitter'
import ServiceBase from '~/services/serviceBase'
import { recordAudit } from '~/utils/admin.utils'
import { ADMIN_ACTIONS, ADMIN_TARGETS } from '~/utils/constants/admin.constants'
import { PLAYER_STATUS } from '~/utils/constants/player.constants'
import { SOCKET_NAMESPACES, SOCKET_ROOMS } from '~/utils/constants/socket'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    status: { enum: Object.values(PLAYER_STATUS) },
    reason: { type: 'string', minLength: 3, maxLength: 500 }
  },
  required: ['playerId', 'status', 'reason']
})

/**
 * Bans, deactivates or reinstates a player. Anything but active also signs
 * them out everywhere: their tokens are revoked and their open sockets are
 * dropped, so they cannot keep betting on a connection opened before.
 */
export class SetPlayerStatusService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, status, reason } = this.args
    const { dbModels: { Player, PlayerSession } } = this.context
    const blocking = status !== PLAYER_STATUS.ACTIVE

    const result = await withTransaction(this, async (transaction) => {
      const player = await Player.findByPk(playerId, { lock: transaction.LOCK.UPDATE, transaction })
      if (!player) return this.addError('PlayerNotFoundErrorType', `#${playerId}`)

      const previous = player.status
      await player.update({ status, ...(blocking && { tokenVersion: player.tokenVersion + 1 }) }, { transaction })
      if (blocking) {
        await PlayerSession.update({ revokedAt: new Date() }, { where: { playerId, revokedAt: { [Op.is]: null } }, transaction })
      }
      await recordAudit(this.context, transaction, {
        action: ADMIN_ACTIONS.PLAYER_STATUS,
        targetType: ADMIN_TARGETS.PLAYER,
        targetId: playerId,
        details: { from: previous, to: status, reason }
      })
      return { player: { playerId, username: player.username, status }, message: SUCCESS_MSG.PLAYER_STATUS_UPDATED }
    })

    if (result && blocking) {
      socketEmitter.of(SOCKET_NAMESPACES.ROULETTE).in(SOCKET_ROOMS.ROULETTE_PLAYER(playerId)).disconnectSockets(true)
    }
    return result
  }
}
