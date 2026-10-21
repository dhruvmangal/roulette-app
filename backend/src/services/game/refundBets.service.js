import ServiceBase from '~/services/serviceBase'
import { ApplyWalletTransactionService } from '~/services/wallet'
import { BET_STATUS } from '~/utils/constants/game.constants'
import { WALLET_DIRECTIONS, WALLET_REFERENCE_TYPES, WALLET_TRANSACTION_TYPES } from '~/utils/constants/wallet.constants'
import { inTransaction } from '~/utils/transaction.utils'

/**
 * Internal: returns PLACED bets to their owners inside the caller's
 * transaction. Players get a REFUND ledger row; bots get their play chips
 * back. Returns the refunded bet ids and each player's new wallet.
 */
export class RefundBetsService extends ServiceBase {
  async run () {
    const { bets } = this.args
    const { dbModels: { RoomPlayer }, sequelizeTransaction: transaction } = this.context

    const wallets = {}
    const betIds = []
    for (const bet of bets) {
      if (bet.status !== BET_STATUS.PLACED) continue
      let payoutTransactionId = null
      if (bet.playerId) {
        const refunded = await ApplyWalletTransactionService.execute({
          playerId: bet.playerId,
          amount: bet.amount,
          direction: WALLET_DIRECTIONS.CREDIT,
          type: WALLET_TRANSACTION_TYPES.REFUND,
          referenceType: WALLET_REFERENCE_TYPES.BET,
          referenceId: String(bet.betId),
          idempotencyKey: `refund:bet:${bet.betId}`
        }, inTransaction(this.context, transaction))
        if (!refunded.successful) return this.mergeErrors(refunded.errors)
        payoutTransactionId = refunded.result.walletTransaction.walletTransactionId
        wallets[bet.playerId] = refunded.result.wallet
      } else {
        const bot = await RoomPlayer.findByPk(bet.roomPlayerId, { lock: transaction.LOCK.UPDATE, transaction })
        await bot.update({ botProfile: { ...bot.botProfile, balance: bot.botProfile.balance + bet.amount } }, { transaction })
      }
      await bet.update({ status: BET_STATUS.REFUNDED, payout: bet.amount, payoutTransactionId }, { transaction })
      betIds.push(bet.betId)
    }
    return { betIds, wallets }
  }
}
