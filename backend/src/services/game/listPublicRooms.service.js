import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { VARIANTS } from '~/utils/constants/game.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'

const constraints = ajv.compile({
  type: 'object',
  properties: { variant: { enum: VARIANTS } }
})

/** Open public tables for the lobby, busiest first. */
export class ListPublicRoomsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { variant = null } = this.args
    const { sequelize } = this.context

    const rooms = await sequelize.query(`
      SELECT r.room_id AS "roomId", r.code, r.variant, r.max_seats AS "maxSeats", r.min_bet AS "minBet",
             r.max_bet AS "maxBet", r.betting_seconds AS "bettingSeconds",
             count(rp.room_player_id) FILTER (WHERE NOT rp.is_bot) AS players,
             count(rp.room_player_id) AS "seatsTaken"
      FROM rooms r
      LEFT JOIN room_players rp ON rp.room_id = r.room_id AND rp.left_at IS NULL
      WHERE r.status = 'OPEN' AND r.mode = 'PUBLIC' AND (CAST(:variant AS text) IS NULL OR r.variant = :variant)
      GROUP BY r.room_id
      ORDER BY players DESC, r.room_id
      LIMIT 50
    `, { replacements: { variant }, type: QueryTypes.SELECT })

    return { rooms, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
