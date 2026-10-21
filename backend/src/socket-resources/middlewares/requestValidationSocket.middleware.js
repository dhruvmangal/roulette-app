import localize from 'ajv-i18n'
import ajv from '~/libs/ajv'
import { getLocalizedError } from '~/utils/error.utils'
import ValidationError from '~/errors/validation.error'
import { SocketRequestInputValidationErrorType } from '~/utils/constants/errors'

/**
 * @export
 * @param {[string, import('./contextSocket.middleware').SocketRequestData, function]} args
 * @param {function} next
 * If a request schema is registered for this event, validates the payload
 * against it. On failure, acks the client with the error and forwards it
 * to `next` so it also reaches the socket-level error handler/logging.
 */
export default function requestValidationSocketMiddleware (args, next) {
  const [eventName, requestData, resCallback] = args

  const { payload, context } = requestData

  const req = context?.socket?.request

  const compiledPayloadSchema = context?.schemas?.request

  const errorPayload = {}
  let error = false

  if (!compiledPayloadSchema) {
    next()
    return
  }

  const locale = req.locale.split('-')[0]

  if (!compiledPayloadSchema(payload)) {
    error = true
    localize[locale](compiledPayloadSchema.errors)
    errorPayload.payload = ajv.errorsText(compiledPayloadSchema.errors, { separator: ' ||||| ' }).split(' ||||| ')
  }

  if (!error) {
    next()
    return
  }

  const validationError = new ValidationError(errorPayload, SocketRequestInputValidationErrorType)
  context?.logger.error('SocketRequestInputValidationError' + ` In namespace ${context?.socket?.nsp.name} event name ${eventName}`, {
    message: validationError.message,
    fault: {
      payload
    }
  })

  const localizedError = getLocalizedError(validationError, req.__)

  resCallback({
    errors: [localizedError],
    data: {}
  })

  next(validationError)
}
