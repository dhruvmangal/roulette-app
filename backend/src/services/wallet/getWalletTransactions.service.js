import { Op } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { pageValidation } from '~/utils/common.utils'
import { WALLET_TRANSACTION_TYPES } from '~/utils/constants/wallet.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    limit: { type: ['string', 'number'] },
    pageNo: { type: ['string', 'number'] },
    type: { enum: Object.values(WALLET_TRANSACTION_TYPES) },
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' }
  },
  required: ['playerId']
})

/** The player's own ledger, newest first. */
export class GetWalletTransactionsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, limit, pageNo, type, from, to } = this.args
    const { dbModels: { WalletTransaction } } = this.context

    const { pageNo: page, size } = pageValidation(pageNo, limit)
    const where = { playerId }
    if (type) where.type = type
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt[Op.gte] = new Date(from)
      if (to) where.createdAt[Op.lte] = new Date(to)
    }

    const transactions = await WalletTransaction.findAndCountAll({
      where,
      order: [['walletTransactionId', 'DESC']],
      limit: size,
      offset: (page - 1) * size,
      raw: true
    })

    return { transactions, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
