import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'

const constraints = ajv.compile({
  type: 'object',
  properties: { playerId: { type: 'integer', minimum: 1 }, token: { type: 'string', minLength: 20, maxLength: 512 } },
  required: ['playerId', 'token']
})

/** Stops sending this player notifications on a phone (when they sign out there). */
export class UnregisterPushTokenService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, token } = this.args
    const { dbModels: { PushToken } } = this.context
    const removed = await PushToken.destroy({ where: { playerId, token } })
    return { removed, message: SUCCESS_MSG.DELETE_SUCCESS }
  }
}
