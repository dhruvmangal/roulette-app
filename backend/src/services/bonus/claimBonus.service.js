import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { ApplyWalletTransactionService } from '~/services/wallet'
import { bonusAvailability } from '~/utils/bonus.utils'
import { BONUS_LEDGER_TYPES } from '~/utils/constants/bonus.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { WALLET_DIRECTIONS, WALLET_REFERENCE_TYPES } from '~/utils/constants/wallet.constants'
import { inTransaction, withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    code: { type: 'string', minLength: 1, maxLength: 32 },
    // Set only by the server (the signup grant), never from a request.
    automatic: { type: 'boolean' }
  },
  required: ['playerId', 'code']
})

/** Pays a bonus into the player's wallet if they may claim it now. */
export class ClaimBonusService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, code, automatic = false } = this.args
    const { dbModels: { Bonus, PlayerBonus, Wallet } } = this.context

    return withTransaction(this, async (transaction) => {
      const bonus = await Bonus.findOne({ where: { code, isActive: true }, transaction })
      if (!bonus) return this.addError('BonusNotFoundErrorType', `"${code}"`)

      // Locking the wallet first makes one player's claims run one at a time.
      const wallet = await Wallet.findOne({ where: { playerId }, lock: transaction.LOCK.UPDATE, transaction })
      if (!wallet) return this.addError('WalletNotFoundErrorType', `for player ${playerId}`)

      const lastClaim = await PlayerBonus.findOne({
        where: { playerId, bonusId: bonus.bonusId },
        order: [['claimNumber', 'DESC']],
        transaction
      })
      const claimedAt = new Date()
      const availability = bonusAvailability(bonus, { lastClaim, balance: wallet.balance, automatic }, claimedAt)
      if (!availability.claimable) {
        const next = availability.nextAvailableAt ? `, next available at ${availability.nextAvailableAt.toISOString()}` : ''
        return this.addError('BonusNotAvailableErrorType', `(${availability.reason}${next})`)
      }

      const claimNumber = (lastClaim?.claimNumber ?? 0) + 1
      const applied = await ApplyWalletTransactionService.execute({
        playerId,
        amount: availability.amount,
        direction: WALLET_DIRECTIONS.CREDIT,
        type: BONUS_LEDGER_TYPES[bonus.type],
        referenceType: WALLET_REFERENCE_TYPES.BONUS,
        referenceId: `${bonus.code}:${claimNumber}`,
        idempotencyKey: `bonus:${bonus.bonusId}:player:${playerId}:claim:${claimNumber}`,
        metadata: { code: bonus.code, claimNumber, streakDay: availability.streakDay }
      }, inTransaction(this.context, transaction))
      if (!applied.successful) return this.mergeErrors(applied.errors)

      const { walletTransaction } = applied.result
      await PlayerBonus.create({
        playerId,
        bonusId: bonus.bonusId,
        claimNumber,
        streakDay: availability.streakDay,
        amount: availability.amount,
        walletTransactionId: walletTransaction.walletTransactionId,
        claimedAt
      }, { transaction })

      return {
        bonus: { code: bonus.code, type: bonus.type, amount: availability.amount, streakDay: availability.streakDay, claimNumber },
        wallet: applied.result.wallet,
        walletTransaction,
        message: SUCCESS_MSG.BONUS_CLAIMED
      }
    })
  }
}
