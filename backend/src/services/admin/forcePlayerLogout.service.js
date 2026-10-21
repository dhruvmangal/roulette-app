import ajv from '~/libs/ajv'
import socketEmitter from '~/libs/socketEmitter'
import ServiceBase from '~/services/serviceBase'
import { LogoutEverywhereService } from '~/services/player'
import { recordAudit } from '~/utils/admin.utils'
import { ADMIN_ACTIONS, ADMIN_TARGETS } from '~/utils/constants/admin.constants'
import { SOCKET_NAMESPACES, SOCKET_ROOMS } from '~/utils/constants/socket'
import { inTransaction, withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: { playerId: { type: 'integer', minimum: 1 } },
  required: ['playerId']
})

/** Signs a player out on every device, e.g. after they report a stolen phone. */
export class ForcePlayerLogoutService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId } = this.args

    const result = await withTransaction(this, async (transaction) => {
      const loggedOut = await LogoutEverywhereService.execute({ playerId }, inTransaction(this.context, transaction))
      if (!loggedOut.successful) return this.mergeErrors(loggedOut.errors)
      await recordAudit(this.context, transaction, { action: ADMIN_ACTIONS.PLAYER_LOGOUT, targetType: ADMIN_TARGETS.PLAYER, targetId: playerId })
      return loggedOut.result
    })

    if (result) socketEmitter.of(SOCKET_NAMESPACES.ROULETTE).in(SOCKET_ROOMS.ROULETTE_PLAYER(playerId)).disconnectSockets(true)
    return result
  }
}
