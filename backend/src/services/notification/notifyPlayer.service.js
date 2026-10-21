import ajv from '~/libs/ajv'
import { isOnline } from '~/libs/presence'
import ServiceBase from '~/services/serviceBase'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { SendPushService } from './sendPush.service'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    // Shown live, in the app, while the player is connected.
    event: { type: 'object', properties: { name: { type: 'string' }, payload: { type: 'object' } }, required: ['name'] },
    // Sent to their phones instead, when they are not connected.
    push: { type: 'object' }
  },
  required: ['playerId']
})

/**
 * Internal: tells a player something. Connected players get the live socket
 * event; everyone else gets the push notification (if they have one set up).
 * It does not throw: telling someone is never worth failing what caused it.
 */
export class NotifyPlayerService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, event, push } = this.args
    let online = false
    try {
      online = await isOnline(playerId)
    } catch (exception) {
      this.log.error('Could not check whether a player is online', { exception })
    }

    if (event && online) RouletteEmitter.toPlayer(playerId, event.name, event.payload ?? {})
    if (push && !online) {
      const pushed = await SendPushService.execute({ playerId, ...push }, this.context)
      if (!pushed.successful) this.log.error('Push was refused', { playerId, fault: pushed.errors })
    }
    return { online }
  }
}
