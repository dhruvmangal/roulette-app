import ajv from '~/libs/ajv'
import redisClient from '~/libs/redisClient'
import ServiceBase from '~/services/serviceBase'
import { NotifyPlayerService } from '~/services/notification'
import { ROOM_STATUS } from '~/utils/constants/game.constants'
import { FRIEND_BLOCKS, FRIEND_INVITE_COOLDOWN_SECONDS, FRIENDSHIP_STATUS } from '~/utils/constants/friend.constants'
import { NOTIFICATION_CATEGORIES } from '~/utils/constants/notification.constants'
import { SOCKET_EMITTERS } from '~/utils/constants/socket'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { findPair } from '~/utils/friend.utils'
import { PUSH_TYPES } from '~/utils/pushMessages.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    friendPlayerId: { type: 'integer', minimum: 1 },
    code: { type: 'string', pattern: '^[A-Z0-9]{6}$' }
  },
  required: ['playerId', 'friendPlayerId', 'code']
})

/**
 * Invites a friend to the table the player is sitting at. The friend hears
 * about it live if connected, or on their phone if not, with the table's
 * code so one tap seats them. Only for tables with people at them (not the
 * practice table against the computer), and once a minute per friend.
 */
export class InviteFriendService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, friendPlayerId, code } = this.args
    const { dbModels: { Friendship, Player, Room, RoomPlayer } } = this.context

    const pair = await findPair(Friendship, playerId, friendPlayerId)
    if (pair?.status !== FRIENDSHIP_STATUS.ACCEPTED) return this.addError('FriendNotFoundErrorType', '')

    const room = await Room.findOne({ where: { code } })
    const seat = room && room.status !== ROOM_STATUS.ENDED && room.mode !== 'VS_COMPUTER'
      ? await RoomPlayer.findOne({ where: { roomId: room.roomId, playerId, leftAt: null } })
      : null
    if (!seat) return this.addError('FriendInviteNotAllowedErrorType', FRIEND_BLOCKS.NOT_AT_THAT_TABLE)

    if (await RoomPlayer.findOne({ where: { roomId: room.roomId, playerId: friendPlayerId, leftAt: null } })) {
      return this.addError('FriendInviteNotAllowedErrorType', FRIEND_BLOCKS.ALREADY_THERE)
    }
    const seated = await RoomPlayer.count({ where: { roomId: room.roomId, leftAt: null } })
    if (seated >= room.maxSeats) return this.addError('FriendInviteNotAllowedErrorType', FRIEND_BLOCKS.TABLE_FULL)

    const first = await redisClient.client.set(`friendInvite:${playerId}:${friendPlayerId}`, '1', 'EX', FRIEND_INVITE_COOLDOWN_SECONDS, 'NX')
    if (!first) return this.addError('FriendInviteNotAllowedErrorType', FRIEND_BLOCKS.TOO_SOON)

    const me = await Player.findByPk(playerId, { attributes: ['playerId', 'username'] })
    await NotifyPlayerService.execute({
      playerId: friendPlayerId,
      event: { name: SOCKET_EMITTERS.ROULETTE_FRIEND_INVITED, payload: { from: { playerId, username: me.username }, code, variant: room.variant, mode: room.mode } },
      push: { category: NOTIFICATION_CATEGORIES.FRIENDS, type: PUSH_TYPES.friendInvite, vars: { name: me.username }, data: { screen: 'join', code } }
    }, this.context)
    return { invited: true, message: SUCCESS_MSG.CREATE_SUCCESS }
  }
}
