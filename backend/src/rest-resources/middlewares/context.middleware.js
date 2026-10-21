import { v4 as uuid } from 'uuid'
import models, { sequelize } from '~/db/models'
import Logger from '~/libs/logger'
import socketEmitter from '~/libs/socketEmitter'

const transactionStatuses = ['commit', 'rollback']
const errorStatusCodes = ['4', '5']

/**
 * @export
 * @param {boolean} automaticTransaction to start the transaction or not
 * @returns {function}
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 *
 * Creates a per-request context available as `req.context`, holding:
 * traceId - id of the request
 * sequelize - sequelize database connection
 * dbModels - all sequelize models
 * logger - logger instance
 * socketEmitter - socket emitter for emitting data directly
 *
 * When `automaticTransaction` is true it also opens a transaction and
 * commits/rolls it back automatically based on the response outcome.
 */
export default function contextMiddleware (automaticTransaction = false) {
  return async (req, res, next) => {
    const context = {}
    context.req = req
    context.reqTimeStamp = Date.now()
    context.traceId = uuid()
    context.sequelize = sequelize
    context.dbModels = models
    context.logger = Logger
    context.socketEmitter = socketEmitter

    if (automaticTransaction) {
      /** @type {import('sequelize').Transaction} */
      context.sequelizeTransaction = await sequelize.transaction()

      const onFinishAndClose = async () => {
        if (~transactionStatuses.indexOf(context.sequelizeTransaction.finished)) {
          return
        }

        if (~errorStatusCodes.indexOf(res.statusCode.toString()[0]) || res.payload?.errors?.length || !res.payload) {
          await context.sequelizeTransaction.rollback()
          return
        }

        await context.sequelizeTransaction.commit()
      }

      res.on('finish', onFinishAndClose)
      res.on('close', onFinishAndClose)
      res.on('prefinish', onFinishAndClose)
    }

    req.context = context
    next()
  }
}
