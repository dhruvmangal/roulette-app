import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { evaluateAchievements } from '~/services/achievement'
import { NotifyPlayerService } from '~/services/notification'
import { FRIEND_BLOCKS, FRIENDSHIP_STATUS, MAX_FRIENDS } from '~/utils/constants/friend.constants'
import { NOTIFICATION_CATEGORIES } from '~/utils/constants/notification.constants'
import { SOCKET_EMITTERS } from '~/utils/constants/socket'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { countFriends } from '~/utils/friend.utils'
import { PUSH_TYPES } from '~/utils/pushMessages.utils'
import { withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    friendshipId: { type: 'integer', minimum: 1 },
    accept: { type: 'boolean' }
  },
  required: ['playerId', 'friendshipId', 'accept']
})

/** Accepts or declines a request someone sent this player. A declined request stays on record. */
export class RespondFriendRequestService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, friendshipId, accept } = this.args
    const { dbModels: { Friendship, Player } } = this.context

    const done = await withTransaction(this, async (transaction) => {
      const request = await Friendship.findOne({ where: { friendshipId, addresseeId: playerId, status: FRIENDSHIP_STATUS.PENDING }, transaction })
      if (!request) return this.addError('FriendRequestNotFoundErrorType', '')

      if (accept) {
        if (await countFriends(Friendship, playerId, transaction) >= MAX_FRIENDS) return this.addError('FriendRequestNotAllowedErrorType', FRIEND_BLOCKS.YOU_HAVE_TOO_MANY)
        if (await countFriends(Friendship, request.requesterId, transaction) >= MAX_FRIENDS) return this.addError('FriendRequestNotAllowedErrorType', FRIEND_BLOCKS.THEY_HAVE_TOO_MANY)
      }
      await request.update({ status: accept ? FRIENDSHIP_STATUS.ACCEPTED : FRIENDSHIP_STATUS.DECLINED, respondedAt: new Date() }, { transaction })
      const [me, them] = await Promise.all([Player.findByPk(playerId, { transaction }), Player.findByPk(request.requesterId, { transaction })])
      return { status: request.status, friend: { playerId: them.playerId, username: them.username }, me: { playerId, username: me.username } }
    })
    if (!done) return

    // Whoever asked hears about a yes, never about a no.
    if (accept) {
      await NotifyPlayerService.execute({
        playerId: done.friend.playerId,
        event: { name: SOCKET_EMITTERS.ROULETTE_FRIEND_ACCEPTED, payload: { from: done.me } },
        push: { category: NOTIFICATION_CATEGORIES.FRIENDS, type: PUSH_TYPES.friendAccepted, vars: { name: done.me.username }, data: { screen: 'friends' } }
      }, this.context)
      await evaluateAchievements(this.context, { playerIds: [playerId, done.friend.playerId], groups: ['friends'] })
    }
    return { status: done.status, friend: done.friend, message: SUCCESS_MSG.UPDATE_SUCCESS }
  }
}
