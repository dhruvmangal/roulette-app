import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { ROOM_MODES, VARIANTS } from '~/utils/constants/game.constants'
import { CreateRoomService } from './createRoom.service'
import { JoinRoomService } from './joinRoom.service'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    variant: { enum: VARIANTS }
  },
  required: ['playerId', 'variant']
})

const CANDIDATES = 5

/** Seats the player at the busiest public table with room, or opens a new one. */
export class QuickMatchService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, variant } = this.args
    const { sequelize } = this.context

    const candidates = await sequelize.query(`
      SELECT r.room_id AS "roomId"
      FROM rooms r
      LEFT JOIN room_players rp ON rp.room_id = r.room_id AND rp.left_at IS NULL
      WHERE r.status = 'OPEN' AND r.mode = 'PUBLIC' AND r.variant = :variant
      GROUP BY r.room_id
      HAVING count(rp.room_player_id) < max(r.max_seats)
      ORDER BY bool_or(rp.player_id = :playerId) DESC NULLS LAST, count(rp.room_player_id) DESC, r.room_id
      LIMIT :limit
    `, { replacements: { variant, playerId, limit: CANDIDATES }, type: QueryTypes.SELECT })

    for (const { roomId } of candidates) {
      const joined = await JoinRoomService.execute({ playerId, roomId }, this.context)
      if (joined.successful) return joined.result
      // Someone took the last seat first; try the next table.
    }

    const created = await CreateRoomService.execute({ playerId, variant, mode: ROOM_MODES.PUBLIC }, this.context)
    if (!created.successful) return this.mergeErrors(created.errors)
    return created.result
  }
}
