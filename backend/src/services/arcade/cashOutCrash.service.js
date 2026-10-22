import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { toArcadeRoundView } from '~/utils/arcade.utils'
import { settleFlight } from '~/utils/crashFlight.utils'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { toWalletView } from '~/utils/player.utils'
import { withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    arcadeRoundId: { type: 'integer', minimum: 1 },
    slot: { type: 'integer', minimum: 0, maximum: 1 }
  },
  required: ['playerId', 'arcadeRoundId', 'slot']
})

/**
 * Pressing the cash-out button. The server reads its own clock, so the bet is paid at the
 * multiplier showing when the request arrives, or lost if the flight has already ended. The answer
 * is the round as it now stands: cashed, or crashed, or (a bet already settled) unchanged.
 */
export class CashOutCrashService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, arcadeRoundId, slot } = this.args
    const { dbModels: { ArcadeRound, Wallet } } = this.context

    const settled = await withTransaction(this, async (transaction) => {
      const round = await ArcadeRound.findOne({ where: { arcadeRoundId, playerId }, lock: transaction.LOCK.UPDATE, transaction })
      if (!round || !round.outcome?.bets?.some((bet) => bet.slot === slot)) return this.addError('ArcadeRoundNotFoundErrorType', `${arcadeRoundId}`)
      if (!await settleFlight(this, round, transaction, { cashNowSlot: slot })) return
      const wallet = await Wallet.findOne({ where: { playerId }, transaction })
      return { round, wallet: toWalletView(wallet) }
    })
    if (!settled) return

    return { round: toArcadeRoundView(settled.round), wallet: settled.wallet, message: SUCCESS_MSG.CRASH_CASHED_OUT }
  }
}
