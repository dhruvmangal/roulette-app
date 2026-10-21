import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { pageValidation } from '~/utils/common.utils'
import { SUCCESS_MSG } from '~/utils/constants/success'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    limit: { type: ['string', 'number'] },
    pageNo: { type: ['string', 'number'] }
  },
  required: ['playerId']
})

/** The player's settled rounds, newest first, with what they staked and won. */
export class GetPlayerHistoryService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, limit, pageNo } = this.args
    const { sequelize } = this.context
    const { pageNo: page, size } = pageValidation(pageNo, limit)

    const rounds = await sequelize.query(`
      SELECT r.round_id AS "roundId", r.round_number AS "roundNumber", r.winning_pocket AS "winningPocket",
             r.result_at AS "resultAt", rm.room_id AS "roomId", rm.code, rm.variant, rm.mode,
             count(b.bet_id) AS bets, sum(b.amount)::bigint AS staked, sum(b.payout)::bigint AS returned,
             (sum(b.payout) - sum(b.amount))::bigint AS net
      FROM bets b
      JOIN rounds r ON r.round_id = b.round_id
      JOIN rooms rm ON rm.room_id = r.room_id
      WHERE b.player_id = :playerId AND b.status IN ('WON', 'LOST')
      GROUP BY r.round_id, rm.room_id
      ORDER BY r.result_at DESC
      LIMIT :size OFFSET :offset
    `, { replacements: { playerId, size, offset: (page - 1) * size }, type: QueryTypes.SELECT })

    return { rounds, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
