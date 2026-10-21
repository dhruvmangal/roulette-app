import InvalidSocketArgumentError from '~/errors/invalidSocketArgument.error'
import { getLocalizedError } from '~/utils/error.utils'

/**
 * @export
 * @param {import('socket.io').Socket} socket
 * @return {function}
 * Normalizes incoming socket args to always be [eventName, payload, callback]
 * — if the client didn't send a payload, args[1] (the callback) is shifted
 * into args[2] and an empty object is inserted in its place.
 */
export default function argumentsDecoratorSocketMiddleware (socket) {
  const req = socket?.request

  return (args, next) => {
    if (args.length > 3 || (args[2] && typeof args[2] !== 'function')) {
      const invalidPayloadError = new InvalidSocketArgumentError({
        payload: args
      })

      if (typeof args[args.length - 1] === 'function') {
        const localizedError = getLocalizedError(invalidPayloadError, req.__)
        args[args.length - 1]({ data: {}, errors: [localizedError] })
      }

      next(invalidPayloadError)
      return
    }

    if (typeof args[1] === 'function') {
      args[2] = args[1]
      args[1] = {}
    }

    next()
  }
}
