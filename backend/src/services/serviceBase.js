import _ from 'lodash'
import logger from '~/libs/logger'

/**
 *
 *
 * @class ServiceBase
 *
 * @classdesc Service Base class for creating services for business logic
 * and perform some task and log them properly
 *
 * @hideconstructor
 */
class ServiceBase {
  #_args = {}
  #_context = {}
  #_errors = {}
  #_successful = null
  #_failed = null
  #_result = null

  constructor () {
    this.#_args = arguments[0]
    this.#_context = arguments[1]
    this.#_errors = {}
    this.#_successful = null
    this.#_failed = null
    this.#_result = null
    this.#validateServiceInputs()
  }

  /**
   * @readonly
   * @memberof ServiceBase
   * @description For reading the context of the service object
   */
  get context () {
    return this.#_context
  }

  /** @readonly */
  get args () {
    return this.#_args
  }

  /** @readonly */
  get result () {
    return this.#_result
  }

  /** @readonly */
  get failed () {
    return this.#_failed
  }

  /** @readonly */
  get errors () {
    return this.#_errors
  }

  /** @readonly */
  get successful () {
    return this.#_successful
  }

  /** @readonly */
  get log () {
    return {
      info: (logTitle, argHash = {}) => {
        argHash.klass = this.constructor
        logger.info(logTitle, argHash)
      },
      debug: (logTitle, argHash = {}) => {
        argHash.klass = this.constructor
        logger.debug(logTitle, argHash)
      },
      error: (logTitle, argHash = {}) => {
        argHash.klass = this.constructor
        logger.error(logTitle, argHash)
      }
    }
  }

  /**
   * @private
   * @function
   * @async
   */
  async #tryExecuting () {
    if (_.size(this.errors)) {
      this.#_failed = true
      this.#_successful = false
      return
    }
    try {
      this.#_result = await this.run()
    } catch (error) {
      logger.error('Exception raised in Service', { klass: this.constructor, message: error.message, context: this.args, exception: error, userCtx: this.context })
      throw error
    }
    this.#_successful = !_.size(this.errors)
    this.#_failed = !!_.size(this.errors)
  }

  /**
   * @param {string} attribute
   * @param {*} errorMessage
   * @return {undefined}
   */
  addError (attribute, errorMessage) {
    // check if attribute is in pascal case
    if (attribute !== _.startCase(_.camelCase(attribute)).replace(/ /g, '')) throw new Error(`${attribute} should be pascal cased in addError()`)

    const errors = this.#_errors[this.constructor.name] = this.#_errors[this.constructor.name] || {}
    if (!errors[attribute]) {
      _.extend(errors, { [attribute]: `${_.startCase(attribute)} ${errorMessage}` })
    } else {
      errors[attribute] = errors[attribute] instanceof Array ? errors[attribute] : [errors[attribute]]
      errors[attribute].push(`${_.startCase(attribute)} ${errorMessage}`)
    }

    logger.debug('Custom Validation Failed', { klass: this.constructor, message: errorMessage, context: { attribute }, userCtx: this.context, fault: this.errors })
  }

  /**
   * @instance
   * @param {any[]} errors
   */
  mergeErrors (errors) {
    _.defaults(this.#_errors, errors)
  }

  /**
   * @instance
   * @private
   * @async
   */
  async #validateServiceInputs () {
    const schema = this.constraints
    if (schema) {
      const valid = schema(this.#_args)
      if (!valid) {
        const validationErrors = schema.errors
        const errors = validationErrors.map(error => error.message)
        _.extend(this.errors, { [this.constructor.name]: errors })
        logger.debug('Service input Validation Failed', { klass: this.constructor, message: 'Validation Failed', context: this.args, userCtx: this.context, fault: this.errors })
      }
    }
  }

  // Static methods

  /**
   * Runs the service and returns its result. Throws if the service collected any errors.
   * @static
   * @async
   */
  static async run () {
    logger.info(`Service Started: ${this.name}`, { context: this.args, userCtx: this.context, wrap: 'start' })
    const args = arguments
    const instance = new this(...args)
    await instance.#tryExecuting()
    if (_.size(instance.errors)) throw instance.errors
    logger.info(`Service Finished: ${this.name}`, { context: this.args, userCtx: this.context, wrap: 'end' })
    return instance.result
  }

  /**
   * Runs the service and returns the full instance (result/successful/failed/errors),
   * never throws — this is what controllers/handlers should call via sendResponse/sendSocketResponse.
   * @static
   * @async
   */
  static async execute () {
    logger.info(`Service Started: ${this.name}`, { context: this.args, userCtx: this.context, wrap: 'start' })
    const args = arguments
    const instance = new this(...args)
    await instance.#tryExecuting()
    logger.info(`Service Finished: ${this.name}`, { context: this.args, userCtx: this.context, wrap: 'end' })
    return instance
  }
}

export default ServiceBase
