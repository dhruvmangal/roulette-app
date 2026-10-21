import * as util from 'util'
import winston from 'winston'
import config from '~/configs/app.config'

const { combine, timestamp, label, printf } = winston.format

const transports = [
  new winston.transports.Console({
    handleExceptions: true
  })
]

const customFormat = printf((info) => {
  const msg = { process: process.pid, timestamp: info.timestamp, label: info.label, level: info.level }
  info = typeof info.message === 'object' ? info.message : info

  if (info.logTitle) {
    msg.logTitle = info.logTitle
    msg.message = info.message || 'No Message'
  }
  if (info.message) {
    msg.message = info.message || 'No Message'
  }
  if (info.stack) {
    msg.stack = info.stack || 'No Message'
  }
  if (info.error && info.message) {
    msg.message = info.error.message || 'No Message'
  }
  if (info.class) {
    msg.class = typeof info.class === 'object' ? util.inspect(info.class) : info.class
  }
  if (info.context) {
    msg.context = typeof info.context === 'object' ? util.inspect(info.context) : info.context
  }
  if (info.metadata) {
    msg.metadata = typeof info.metadata === 'object' ? util.inspect(info.metadata) : info.metadata
  }
  if (info.exceptionBacktrace) {
    msg.exceptionBacktrace = typeof info.exceptionBacktrace === 'object' ? util.inspect(info.exceptionBacktrace) : info.exceptionBacktrace
  }
  if (info.fault) {
    msg.fault = typeof info.fault === 'object' ? util.inspect(info.fault) : info.fault
  }

  return JSON.stringify(msg)
})

const format = combine(
  label({ label: config.get('app.name') }),
  timestamp(),
  customFormat
)

const winstonLogger = winston.createLogger({ level: config.get('log_level') || 'info', transports, exitOnError: false, format })

/**
 * @typedef {Object} LogArgHash with message and other properties
 * @property {string} wrap to wrap the log message
 * @property {(Object | number | string)} klass name of the class or constructor
 * @property {(Object | number | string)} message message to log
 * @property {(Object | number | string)} context context of the log
 * @property {(Object | number | string)} metadata extra metadata for the log
 * @property {(Object | number | string)} exception exception for the log
 * @property {(Object | number | string)} fault fault for the log
 */

/**
 * @class Logger
 *
 * @classdesc class which utilizes winston instance
 * for logging things to console (and, if you add transports, to disk / a log service)
 *
 * @hideconstructor
 */
class Logger {
  static info (logTitle, argHash = {}) {
    this.#log('info', logTitle, argHash)
  }

  static debug (logTitle, argHash = {}) {
    this.#log('debug', logTitle, argHash)
  }

  static error (logTitle, argHash = {}) {
    this.#log('error', logTitle, argHash)
  }

  static #log (logType, logTitle, argHash = {}) {
    const allArgs = Object.assign({ logTitle }, argHash)
    const logMessage = this.#buildMessage(allArgs)
    this.#writeToLog(logType, logTitle, logMessage, argHash)
  }

  static #writeToLog (logType, logTitle, logMessage, argHash = {}) {
    if (argHash && argHash.wrap === 'start') {
      winstonLogger[logType](this.#generateWrapStr(logTitle, 'START'))
    } else if (argHash && argHash.wrap === 'end') {
      winstonLogger[logType](this.#generateWrapStr(logTitle, 'END'))
    } else {
      winstonLogger[logType](logMessage)
    }
  }

  static #generateWrapStr (logTitle, wrapWord) {
    return `${wrapWord}${'='.repeat(15)}${logTitle.toUpperCase()}${'='.repeat(15)}${wrapWord}`
  }

  static #buildMessage (logAttrs) {
    const msg = { logTitle: logAttrs.logTitle }
    if (logAttrs.klass) { msg.class = logAttrs.klass.name }
    if (logAttrs.message) { msg.message = logAttrs.message }
    if (logAttrs.context) { msg.context = logAttrs.context }
    if (logAttrs.metadata) { msg.metadata = logAttrs.metadata }
    if (logAttrs.exception) { msg.exceptionBacktrace = logAttrs.exception.stack }
    if (logAttrs.fault) { msg.fault = logAttrs.fault }
    return msg
  }
}

export default Logger
