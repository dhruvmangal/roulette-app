import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { pageValidation } from '~/utils/common.utils'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { WALLET_DIRECTIONS, WALLET_TRANSACTION_TYPES } from '~/utils/constants/wallet.constants'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    type: { enum: Object.values(WALLET_TRANSACTION_TYPES) },
    direction: { enum: Object.values(WALLET_DIRECTIONS) },
    minAmount: { type: 'integer', minimum: 1 },
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' },
    limit: { type: ['string', 'number'] },
    pageNo: { type: ['string', 'number'] }
  }
})

/** The whole wallet ledger across players, newest first, with filters. */
export class ListTransactionsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, type, direction, minAmount, from, to, limit, pageNo } = this.args
    const { sequelize } = this.context
    const { pageNo: page, size } = pageValidation(pageNo, limit, 200)

    const filters = { playerId: 't.player_id = :playerId', type: 't.type = :type', direction: 't.direction = :direction', minAmount: 't.amount >= :minAmount', from: 't.created_at >= :from', to: 't.created_at <= :to' }
    const replacements = { size, offset: (page - 1) * size }
    const conditions = []
    for (const [key, sql] of Object.entries(filters)) {
      if (this.args[key] === undefined) continue
      replacements[key] = ['from', 'to'].includes(key) ? new Date(this.args[key]) : this.args[key]
      conditions.push(sql)
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    // The total is counted separately: a window count would scan the whole ledger for every page.
    const [rows, [{ count }]] = await Promise.all([
      sequelize.query(`
        SELECT t.wallet_transaction_id AS "walletTransactionId", t.player_id AS "playerId", p.username,
               t.type, t.direction, t.amount, t.balance_before AS "balanceBefore", t.balance_after AS "balanceAfter",
               t.reference_type AS "referenceType", t.reference_id AS "referenceId", t.metadata, t.created_at AS "createdAt"
        FROM wallet_transactions t
        JOIN players p ON p.player_id = t.player_id
        ${where}
        ORDER BY t.wallet_transaction_id DESC
        LIMIT :size OFFSET :offset
      `, { replacements, type: QueryTypes.SELECT }),
      sequelize.query(`SELECT count(*) AS count FROM wallet_transactions t ${where}`, { replacements, type: QueryTypes.SELECT })
    ])

    return { transactions: rows, count, pageNo: page, limit: size, filters: { playerId, type, direction, minAmount, from, to }, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
