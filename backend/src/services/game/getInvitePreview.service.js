import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { ROOM_STATUS } from '~/utils/constants/game.constants'

const constraints = ajv.compile({
  type: 'object',
  properties: { code: { type: 'string', pattern: '^[A-Z0-9]{6}$' } },
  required: ['code']
})

const VARIANT_TITLES = { AMERICAN: 'American', ENGLISH: 'European' }

/**
 * What an invite link's preview says: who is inviting, to which table, and
 * how full it is. Anyone holding the link already has the code, so this tells
 * them nothing more than joining would; a closed or unknown table says so.
 */
export class GetInvitePreviewService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { code } = this.args
    const { dbModels: { Player, Room, RoomPlayer } } = this.context

    const room = await Room.findOne({ where: { code } })
    if (!room || room.status === ROOM_STATUS.ENDED) {
      return { title: 'This roulette table has closed', description: 'Ask your friend for a new invite, or open a table of your own. Play chips only, no real money.' }
    }

    const [host, seated] = await Promise.all([
      room.hostPlayerId ? Player.findByPk(room.hostPlayerId, { attributes: ['username'] }) : null,
      RoomPlayer.count({ where: { roomId: room.roomId, leftAt: null } })
    ])
    const variant = VARIANT_TITLES[room.variant] ?? room.variant
    const free = Math.max(0, room.maxSeats - seated)
    return {
      title: host ? `${host.username} invited you to play roulette 🎰` : 'You’re invited to play roulette 🎰',
      description: `Private ${variant} roulette table · code ${code} · ${free} of ${room.maxSeats} seats free. Tap to take your seat. Play chips only, no real money.`
    }
  }
}
