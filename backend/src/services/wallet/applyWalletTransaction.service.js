import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { WALLET_DIRECTIONS, WALLET_REFERENCE_TYPES, WALLET_TRANSACTION_TYPES } from '~/utils/constants/wallet.constants'
import { toWalletView } from '~/utils/player.utils'
import { withTransaction } from '~/utils/transaction.utils'

// Far below Number.MAX_SAFE_INTEGER, so balances can never lose precision.
const MAX_AMOUNT = 1e12

const schema = {
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    amount: { type: 'integer', minimum: 1, maximum: MAX_AMOUNT },
    direction: { enum: Object.values(WALLET_DIRECTIONS) },
    type: { enum: Object.values(WALLET_TRANSACTION_TYPES) },
    referenceType: { enum: [...Object.values(WALLET_REFERENCE_TYPES), null] },
    referenceId: { type: ['string', 'null'], maxLength: 64 },
    idempotencyKey: { type: 'string', minLength: 1, maxLength: 128 },
    metadata: { type: 'object' }
  },
  required: ['playerId', 'amount', 'direction', 'type', 'idempotencyKey']
}

const constraints = ajv.compile(schema)

/**
 * The ONLY code allowed to change a wallet balance. Internal: bets, payouts,
 * bonuses and refunds call it with their own transaction.
 *
 * Locks the wallet row, so concurrent calls for one player run one at a
 * time and can never overdraw. Idempotent: replaying an idempotencyKey
 * returns the original ledger row instead of moving chips twice.
 */
export class ApplyWalletTransactionService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, amount, direction, type, referenceType = null, referenceId = null, idempotencyKey, metadata = {} } = this.args
    const { dbModels: { Wallet, WalletTransaction } } = this.context

    return withTransaction(this, async (transaction) => {
      const wallet = await Wallet.findOne({ where: { playerId }, lock: transaction.LOCK.UPDATE, transaction })
      if (!wallet) return this.addError('WalletNotFoundErrorType', `for player ${playerId}`)

      const previous = await WalletTransaction.findOne({ where: { idempotencyKey }, transaction })
      if (previous) {
        const sameRequest = previous.playerId === playerId && previous.amount === amount &&
          previous.direction === direction && previous.type === type
        if (!sameRequest) return this.addError('IdempotencyKeyConflictErrorType', `"${idempotencyKey}"`)
        return { wallet: toWalletView(wallet), walletTransaction: previous.get({ plain: true }), replayed: true }
      }

      const balanceBefore = wallet.balance
      const balanceAfter = direction === WALLET_DIRECTIONS.CREDIT ? balanceBefore + amount : balanceBefore - amount
      if (balanceAfter < 0) return this.addError('InsufficientBalanceErrorType', `(balance ${balanceBefore}, needs ${amount})`)

      const walletTransaction = await WalletTransaction.create({
        walletId: wallet.walletId,
        playerId,
        type,
        direction,
        amount,
        balanceBefore,
        balanceAfter,
        referenceType,
        referenceId,
        idempotencyKey,
        metadata
      }, { transaction })
      await wallet.update({ balance: balanceAfter, version: wallet.version + 1 }, { transaction })

      return { wallet: toWalletView(wallet), walletTransaction: walletTransaction.get({ plain: true }), replayed: false }
    })
  }
}
