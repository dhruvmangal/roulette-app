import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { FRIENDSHIP_STATUS } from '~/utils/constants/friend.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { findPair } from '~/utils/friend.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: { playerId: { type: 'integer', minimum: 1 }, friendPlayerId: { type: 'integer', minimum: 1 } },
  required: ['playerId', 'friendPlayerId']
})

/**
 * Ends a friendship, or takes back a request this player sent. Nothing is
 * said to the other player. A request someone sent this player is answered
 * with decline instead, which is what keeps it from coming back.
 */
export class RemoveFriendService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, friendPlayerId } = this.args
    const { dbModels: { Friendship } } = this.context

    const row = await findPair(Friendship, playerId, friendPlayerId)
    const mine = row && (row.status === FRIENDSHIP_STATUS.ACCEPTED || (row.status === FRIENDSHIP_STATUS.PENDING && row.requesterId === playerId))
    if (!mine) return this.addError('FriendNotFoundErrorType', '')
    await row.destroy()
    return { removed: true, message: SUCCESS_MSG.DELETE_SUCCESS }
  }
}
