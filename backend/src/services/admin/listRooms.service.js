import pickBy from 'lodash/pickBy'
import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { pageValidation } from '~/utils/common.utils'
import { ROOM_MODES, ROOM_STATUS } from '~/utils/constants/game.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    status: { enum: Object.values(ROOM_STATUS) },
    mode: { enum: Object.values(ROOM_MODES) },
    limit: { type: ['string', 'number'] },
    pageNo: { type: ['string', 'number'] }
  }
})

/** Tables, newest first, with who is seated and how much has been staked. */
export class ListRoomsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { status, mode, limit, pageNo } = this.args
    const { sequelize } = this.context
    const { pageNo: page, size } = pageValidation(pageNo, limit, 100)

    const conditions = []
    if (status) conditions.push('r.status = :status')
    if (mode) conditions.push('r.mode = :mode')
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = await sequelize.query(`
      SELECT r.room_id AS "roomId", r.code, r.variant, r.mode, r.status, r.max_seats AS "maxSeats",
             r.min_bet AS "minBet", r.max_bet AS "maxBet", r.total_rounds AS "totalRounds", r.created_at AS "createdAt",
             host.username AS "hostUsername",
             (SELECT coalesce(json_agg(json_build_object('playerId', rp.player_id, 'username', coalesce(p.username, rp.bot_profile->>'name'),
                       'isBot', rp.is_bot, 'seat', rp.seat, 'away', rp.away_since IS NOT NULL) ORDER BY rp.seat), '[]')
                FROM room_players rp LEFT JOIN players p ON p.player_id = rp.player_id
               WHERE rp.room_id = r.room_id AND rp.left_at IS NULL) AS seated,
             (SELECT count(*) FROM rounds rd WHERE rd.room_id = r.room_id AND rd.status = 'SETTLED') AS rounds,
             (SELECT max(rd.started_at) FROM rounds rd WHERE rd.room_id = r.room_id) AS "lastRoundAt",
             (SELECT coalesce(sum(b.amount), 0)::bigint FROM bets b JOIN rounds rd ON rd.round_id = b.round_id
               WHERE rd.room_id = r.room_id AND b.player_id IS NOT NULL) AS staked,
             count(*) OVER () AS "totalCount"
      FROM rooms r
      LEFT JOIN players host ON host.player_id = r.host_player_id
      ${where}
      ORDER BY r.room_id DESC
      LIMIT :size OFFSET :offset
    `, { replacements: { ...pickBy({ status, mode }, Boolean), size, offset: (page - 1) * size }, type: QueryTypes.SELECT })

    const count = rows[0]?.totalCount ?? 0
    return { rooms: rows.map(({ totalCount, ...room }) => room), count, pageNo: page, limit: size, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
