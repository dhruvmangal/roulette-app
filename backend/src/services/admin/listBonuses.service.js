import { QueryTypes } from 'sequelize'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'

/** Every bonus with how often it has been claimed. */
export class ListBonusesService extends ServiceBase {
  async run () {
    const { sequelize } = this.context

    const bonuses = await sequelize.query(`
      SELECT b.bonus_id AS "bonusId", b.code, b.type, b.amount, b.cooldown_seconds AS "cooldownSeconds",
             b.max_claims AS "maxClaims", b.min_balance_threshold AS "minBalanceThreshold", b.is_active AS "isActive",
             b.updated_at AS "updatedAt",
             count(pb.player_bonus_id) AS claims,
             coalesce(sum(pb.amount), 0)::bigint AS "totalPaid",
             count(pb.player_bonus_id) FILTER (WHERE pb.claimed_at >= now() - interval '1 day') AS "claimsToday"
      FROM bonuses b
      LEFT JOIN player_bonuses pb ON pb.bonus_id = b.bonus_id
      GROUP BY b.bonus_id
      ORDER BY b.bonus_id
    `, { type: QueryTypes.SELECT })

    return { bonuses, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
