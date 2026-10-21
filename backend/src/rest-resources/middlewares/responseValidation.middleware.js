import Flatted from 'flatted'
import { StatusCodes } from 'http-status-codes'
import ajv from '~/libs/ajv'
import { ResponseValidationErrorType } from '~/utils/constants/errors'
import ValidationError from '~/errors/validation.error'

/**
 * @typedef {Object} ResponseSchema
 * @property {import('ajv').Schema} default
 */

/**
 * @typedef {Object} RestResponseSchemas
 * @property {ResponseSchema} responseSchema
 */

/**
 * @export
 * @name responseValidationMiddleware
 * @param {RestResponseSchemas} params
 * @return {function}
 * Returns an express middleware closed over a response JSON schema. Always
 * sends the response in `{ data, errors }` form; a schema mismatch is
 * treated as a server bug and raises a ValidationError.
 *
 * @example
 * responseValidationMiddleware({
 *  responseSchema: {
 *    default: { type: 'object' },
 *    200: { type: 'object' },
 *    '2xx': { type: 'object' }
 *  }
 * })
 */
export default function responseValidationMiddleware ({ responseSchema = {} } = {}) {
  const compiledResponseSchema = {}

  if (responseSchema) {
    const httpCodes = Object.keys(responseSchema)
    for (const code of httpCodes) {
      const schema = responseSchema[code]

      compiledResponseSchema[code] = ajv.compile(schema)
    }
  }

  return (req, res, next) => {
    res.payload = { data: null, errors: [], ...res.payload }

    res.payload = Flatted.parse(Flatted.stringify(res.payload))

    const statusCode = res.statusCode || req?.context?.statusCode || StatusCodes.OK

    const compiledSchema = compiledResponseSchema[statusCode] || compiledResponseSchema[`${statusCode.toString()[0]}xx`] || compiledResponseSchema.default

    if (compiledSchema) {
      if (compiledSchema(res.payload?.data)) {
        res.status(statusCode).json({ ...res.payload })
      } else {
        const errors = ajv.errorsText(compiledSchema.errors, { separator: ' ||||| ' }).split(' ||||| ')
        const validationError = new ValidationError({ errors }, ResponseValidationErrorType)
        next(validationError)
      }
    } else {
      res.status(statusCode).json({ ...res.payload })
    }
  }
}
