import _ from 'lodash'

const ROLLBACK = Symbol('rollback')

/**
 * Runs `work` inside the caller's transaction (context.sequelizeTransaction,
 * e.g. from contextMiddleware(true)) or, when there is none, inside a new
 * one. A new transaction rolls back if the service recorded any errors, so a
 * failed service never leaves half its writes behind.
 *
 * @param {import('~/services/serviceBase').default} service
 * @param {(transaction: import('sequelize').Transaction) => Promise<*>} work
 */
export const withTransaction = async (service, work) => {
  const { sequelizeTransaction, sequelize } = service.context
  if (sequelizeTransaction) return work(sequelizeTransaction)

  let result
  try {
    await sequelize.transaction(async (transaction) => {
      result = await work(transaction)
      if (_.size(service.errors)) throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
  return result
}

/** The context to hand a nested service so it joins this transaction. */
export const inTransaction = (context, transaction) => ({ ...context, sequelizeTransaction: transaction })
