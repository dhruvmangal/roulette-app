import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { toArcadeRoundView } from '~/utils/arcade.utils'
import { settleFlight } from '~/utils/crashFlight.utils'
import { ARCADE_STATUS } from '~/utils/constants/arcade.constants'
import { toWalletView } from '~/utils/player.utils'
import { withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    game: { enum: ['AVIATOR'] }
  },
  required: ['playerId', 'game']
})

/**
 * The player's flight that is still in the air, if any: what the page asks after a reload, and
 * when a flight with an auto cash-out should have landed. A flight that ended in the meantime is
 * settled (and paid) here, and comes back as `landed` so the page can show how it ended.
 */
export class GetActiveCrashService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, game } = this.args
    const { dbModels: { ArcadeRound, Wallet } } = this.context

    const result = await withTransaction(this, async (transaction) => {
      const round = await ArcadeRound.findOne({ where: { playerId, game, status: ARCADE_STATUS.ACTIVE }, lock: transaction.LOCK.UPDATE, transaction })
      if (!round) return { round: null, landed: null }
      if (!await settleFlight(this, round, transaction)) return
      const wallet = await Wallet.findOne({ where: { playerId }, transaction })
      const view = toArcadeRoundView(round)
      return round.status === ARCADE_STATUS.ACTIVE
        ? { round: view, landed: null, wallet: toWalletView(wallet) }
        : { round: null, landed: view, wallet: toWalletView(wallet) }
    })
    return result
  }
}
