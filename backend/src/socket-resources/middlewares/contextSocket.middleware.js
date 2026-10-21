import { v4 as uuid } from 'uuid'
import models, { sequelize } from '~/db/models'
import Logger from '~/libs/logger'
import responseValidationSocketMiddleware from './responseValidationSocket.middleware'

/**
 * @typedef {Object} SocketRequestData
 * @property {Object} payload
 * @property {SocketContext} context
 */

/**
 * @typedef {Object} SocketSchemas
 * @property {import('ajv').ValidateFunction} request
 * @property {import('ajv').ValidateFunction} response
 */

/**
 * @typedef {Object} SocketContext
 * @property {import('socket.io').Socket} socket
 * @property {string} traceId
 * @property {import('sequelize')} sequelize
 * @property {Object} dbModels
 * @property {Logger} logger
 * @property {SocketSchemas} schemas
 */

/**
 * @export
 * @param {import('socket.io').Socket} socket
 * @param {Object.<string, SocketSchemas>} socketSchemas
 * @return {function}
 * Wraps every event handler with a per-message context (mirrors REST's
 * contextMiddleware) and hooks the ack callback through response validation.
 */
export default function contextSocketMiddleware (socket, socketSchemas = {}) {
  return function (args, next) {
    const [event, payload, callback] = args

    const context = {}
    context.schemas = socketSchemas[event] || {}
    context.socket = socket
    context.msgTimeStamp = Date.now()
    context.traceId = uuid()
    context.sequelize = sequelize
    context.dbModels = models
    context.logger = Logger

    args[1] = { payload, context }
    args[2] = responseValidationSocketMiddleware.bind(null, context, event, callback)
    next()
  }
}
