import { socketSchemaBuilder } from '~/libs/ajv'
import { SOCKET_NAMESPACES, SOCKET_ROOMS } from '~/utils/constants/socket'
import contextSocketMiddleware from '~/socket-resources/middlewares/contextSocket.middleware'
import requestValidationSocketMiddleware from '~/socket-resources/middlewares/requestValidationSocket.middleware'
import DemoHandler from '~/socket-resources/handlers/demo.handler'

// Per-event request/response schemas, compiled once at boot.
const schemas = socketSchemaBuilder({
  ping: {
    request: { type: 'object', properties: { message: { type: 'string' } } },
    response: { type: 'object', properties: { message: { type: 'string' } } }
  }
})

/**
 * @export
 * @param {import('socket.io').Server} io
 * Example namespace — shows the standard wiring:
 *  - `socket.use(contextSocketMiddleware(...))` runs on every incoming
 *    event, builds a per-message context, and decorates the handler args
 *    into `({ payload, context }, ackCallback)`.
 *  - `socket.use(requestValidationSocketMiddleware)` then validates the
 *    payload against that event's schema (if any).
 *  - `socket.on(eventName, Handler.method)` receives the already-decorated
 *    args and just implements business logic + calls the ack callback.
 */
export default function (io) {
  const namespace = io.of(SOCKET_NAMESPACES.DEMO)

  namespace.on('connection', (socket) => {
    socket.join(SOCKET_ROOMS.DEMO_ROOM)

    socket.use(contextSocketMiddleware(socket, schemas))
    socket.use(requestValidationSocketMiddleware)

    socket.on('ping', DemoHandler.ping)
  })
}
