import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { evaluateAchievements } from '~/services/achievement'
import { NotifyPlayerService } from '~/services/notification'
import { NOTIFICATION_CATEGORIES } from '~/utils/constants/notification.constants'
import { FRIEND_BLOCKS, FRIENDSHIP_STATUS, MAX_FRIENDS, MAX_PENDING_REQUESTS } from '~/utils/constants/friend.constants'
import { USERNAME_PATTERN } from '~/utils/constants/player.constants'
import { SOCKET_EMITTERS } from '~/utils/constants/socket'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { countFriends, findPair } from '~/utils/friend.utils'
import { sameIgnoringCase } from '~/utils/player.utils'
import { PUSH_TYPES } from '~/utils/pushMessages.utils'
import { withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    username: { type: 'string', pattern: USERNAME_PATTERN }
  },
  required: ['playerId', 'username']
})

/**
 * Asks a player, by username, to be friends. Asking someone who already asked
 * you is the same as accepting. Asking again is harmless, and asking someone
 * who declined says nothing to either of you: no second notification.
 */
export class SendFriendRequestService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, username } = this.args
    const { dbModels: { Friendship, Player } } = this.context

    const done = await withTransaction(this, async (transaction) => {
      const me = await Player.findByPk(playerId, { transaction })
      const target = await Player.findOne({ where: sameIgnoringCase('username', username), transaction })
      if (!me || !target || target.status !== 'active') return this.addError('PlayerNameNotFoundErrorType', '')
      if (target.playerId === playerId) return this.addError('FriendRequestNotAllowedErrorType', FRIEND_BLOCKS.SELF)

      const friend = { playerId: target.playerId, username: target.username }
      const existing = await findPair(Friendship, playerId, target.playerId, transaction)
      if (existing?.status === FRIENDSHIP_STATUS.ACCEPTED) return this.addError('FriendRequestNotAllowedErrorType', FRIEND_BLOCKS.ALREADY_FRIENDS)
      // They declined this player's earlier request: look sent, send nothing.
      if (existing?.status === FRIENDSHIP_STATUS.DECLINED && existing.requesterId === playerId) {
        return { result: { status: FRIENDSHIP_STATUS.PENDING, friendshipId: existing.friendshipId, friend }, notify: null }
      }
      if (existing?.status === FRIENDSHIP_STATUS.PENDING && existing.requesterId === playerId) {
        return { result: { status: FRIENDSHIP_STATUS.PENDING, friendshipId: existing.friendshipId, friend }, notify: null }
      }

      if (await countFriends(Friendship, playerId, transaction) >= MAX_FRIENDS) return this.addError('FriendRequestNotAllowedErrorType', FRIEND_BLOCKS.YOU_HAVE_TOO_MANY)
      if (await countFriends(Friendship, target.playerId, transaction) >= MAX_FRIENDS) return this.addError('FriendRequestNotAllowedErrorType', FRIEND_BLOCKS.THEY_HAVE_TOO_MANY)

      // They already asked this player: that is a yes.
      if (existing?.status === FRIENDSHIP_STATUS.PENDING) {
        await existing.update({ status: FRIENDSHIP_STATUS.ACCEPTED, respondedAt: new Date() }, { transaction })
        return { result: { status: FRIENDSHIP_STATUS.ACCEPTED, friendshipId: existing.friendshipId, friend }, notify: { to: target.playerId, accepted: true, name: me.username } }
      }

      if (await Friendship.count({ where: { requesterId: playerId, status: FRIENDSHIP_STATUS.PENDING }, transaction }) >= MAX_PENDING_REQUESTS) {
        return this.addError('FriendRequestNotAllowedErrorType', FRIEND_BLOCKS.TOO_MANY_PENDING)
      }

      let row
      if (existing) {
        // This player had declined theirs: a fresh request from this player replaces the old record.
        await existing.update({ requesterId: playerId, addresseeId: target.playerId, status: FRIENDSHIP_STATUS.PENDING, respondedAt: null }, { transaction })
        row = existing
      } else {
        try {
          row = await Friendship.create({ requesterId: playerId, addresseeId: target.playerId, status: FRIENDSHIP_STATUS.PENDING }, { transaction })
        } catch (error) {
          // Lost a race with the same request arriving twice.
          if (error.name !== 'SequelizeUniqueConstraintError') throw error
          return { result: { status: FRIENDSHIP_STATUS.PENDING, friendshipId: null, friend }, notify: null }
        }
      }
      return { result: { status: FRIENDSHIP_STATUS.PENDING, friendshipId: row.friendshipId, friend }, notify: { to: target.playerId, accepted: false, name: me.username, from: playerId } }
    })
    if (!done) return

    const { notify } = done
    if (notify) {
      const mine = { playerId, username: notify.name }
      await NotifyPlayerService.execute({
        playerId: notify.to,
        event: { name: notify.accepted ? SOCKET_EMITTERS.ROULETTE_FRIEND_ACCEPTED : SOCKET_EMITTERS.ROULETTE_FRIEND_REQUEST, payload: { from: mine } },
        push: {
          category: NOTIFICATION_CATEGORIES.FRIENDS,
          type: notify.accepted ? PUSH_TYPES.friendAccepted : PUSH_TYPES.friendRequest,
          vars: { name: notify.name },
          data: { screen: 'friends' }
        }
      }, this.context)
    }
    if (done.result.status === FRIENDSHIP_STATUS.ACCEPTED) await evaluateAchievements(this.context, { playerIds: [playerId, done.result.friend.playerId], groups: ['friends'] })
    return { ...done.result, message: SUCCESS_MSG.CREATE_SUCCESS }
  }
}
