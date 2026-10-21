/**
 * Example handler — one class per file, static methods as event handlers.
 * Receives the decorated `(payload, context)` object produced by
 * contextSocketMiddleware, plus the wrapped ack function.
 */
export default class DemoHandler {
  static async ping ({ payload, context }, ack) {
    context.logger.info('Demo Ping Received', { message: payload?.message })

    ack({ data: { message: `pong: ${payload?.message || ''}`.trim() }, errors: [] })
  }
}
