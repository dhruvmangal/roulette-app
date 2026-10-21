import ValidationError from '~/errors/validation.error'
import ajv from '~/libs/ajv'
import localize from 'ajv-i18n'
import { RequestInputValidationErrorType } from '~/utils/constants/errors'

/**
 * @typedef {Object} RestRequestSchemas
 * @property {import('ajv').Schema} querySchema
 * @property {import('ajv').Schema} paramsSchema
 * @property {import('ajv').Schema} bodySchema
 */

/**
 * @export
 * @name requestValidationMiddleware
 * @param {RestRequestSchemas} schema
 * @return {function}
 * Returns an express middleware closed over query/params/body JSON schemas.
 * Any validation failure logs and returns a RequestInputValidationError.
 *
 * @example
 * requestValidationMiddleware({
 *   querySchema: { type: 'object' },
 *   paramsSchema: { type: 'object' },
 *   bodySchema: { type: 'object' }
 * })
 */
export default function requestValidationMiddleware ({ querySchema = {}, paramsSchema = {}, bodySchema = {} } = {}) {
  const compiledQuerySchema = ajv.compile(querySchema)
  const compiledParamsSchema = ajv.compile(paramsSchema)
  const compiledBodySchema = ajv.compile(bodySchema)

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} _res
   * @param {import('express').NextFunction} next
  */
  return (req, _res, next) => {
    const errorPayload = {}
    let error = false

    const locale = req.locale.split('-')[0]

    if (compiledQuerySchema) {
      if (!compiledQuerySchema(req.query)) {
        error = true
        localize[locale](compiledQuerySchema.errors)
        errorPayload.query = ajv.errorsText(compiledQuerySchema.errors, { separator: ' ||||| ' }).split(' ||||| ')
      }
    }

    if (compiledParamsSchema) {
      if (!compiledParamsSchema(req.params)) {
        error = true
        localize[locale](compiledParamsSchema.errors)
        errorPayload.params = ajv.errorsText(compiledParamsSchema.errors, { separator: ' ||||| ' }).split(' ||||| ')
      }
    }

    if (compiledBodySchema) {
      if (!compiledBodySchema(req.body)) {
        error = true
        localize[locale](compiledBodySchema.errors)
        errorPayload.body = ajv.errorsText(compiledBodySchema.errors, { separator: ' ||||| ' }).split(' ||||| ')
      }
    }

    if (error) {
      const validationError = new ValidationError(errorPayload, RequestInputValidationErrorType)

      next(validationError)
    } else {
      next()
    }
  }
}
