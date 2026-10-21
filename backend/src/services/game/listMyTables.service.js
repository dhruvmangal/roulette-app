import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'

const constraints = ajv.compile({
  type: 'object',
  properties: { playerId: { type: 'integer', minimum: 1 } },
  required: ['playerId']
})

/** Open tables the player still has a seat at, so the app can offer to rejoin them. */
export class ListMyTablesService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId } = this.args
    const { sequelize } = this.context

    const tables = await sequelize.query(`
      SELECT r.room_id AS "roomId", r.code, r.variant, r.mode, me.seat, me.joined_at AS "joinedAt",
             count(rp.room_player_id) FILTER (WHERE NOT rp.is_bot) AS players,
             count(rp.room_player_id) FILTER (WHERE rp.is_bot) AS bots
      FROM room_players me
      JOIN rooms r ON r.room_id = me.room_id AND r.status IN ('WAITING', 'OPEN')
      JOIN room_players rp ON rp.room_id = r.room_id AND rp.left_at IS NULL
      WHERE me.player_id = :playerId AND me.left_at IS NULL
      GROUP BY r.room_id, me.room_player_id
      ORDER BY me.joined_at DESC
    `, { replacements: { playerId }, type: QueryTypes.SELECT })

    return { tables, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
