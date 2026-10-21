import Flatted from 'flatted'
import Logger from '~/libs/logger'
import socketEmitter from '~/libs/socketEmitter'
import { ERROR_MSG } from '~/utils/constants/errors'
import { SOCKET_EMITTERS, SOCKET_NAMESPACES, SOCKET_ROOMS } from '~/utils/constants/socket'

/**
 * Example emitter — for pushing server-initiated events to connected
 * clients (e.g. from a service, a cron job, or a webhook handler) without
 * going through a request/response cycle.
 *
 * @export
 * @class DemoEmitter
 */
export default class DemoEmitter {
  static async emitDemoEvent (data) {
    try {
      data = Flatted.parse(Flatted.stringify(data))
      socketEmitter.of(SOCKET_NAMESPACES.DEMO).to(SOCKET_ROOMS.DEMO_ROOM).emit(SOCKET_EMITTERS.DEMO_EVENT, { data })
    } catch (error) {
      Logger.info('Error In Emitter', { message: ERROR_MSG.EMITTER_ERROR })
      Logger.info('Actual Error', { exception: error })
    }
  }
}
