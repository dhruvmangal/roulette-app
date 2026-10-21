import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'

const constraints = ajv.compile({
  type: 'object',
  properties: { days: { type: 'integer', minimum: 1, maximum: 90 } }
})

/**
 * Headline numbers for the admin dashboard, plus a per-day series.
 *
 * House net is what players lost: stakes (BET debits) minus payouts (WIN
 * credits, which include the returned stake) minus REFUND credits. Bonuses
 * and admin adjustments are chips the house handed out, reported separately.
 */
export class GetDashboardStatsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { days = 14 } = this.args
    const { sequelize } = this.context

    const [[players], [chips], [last24h], [tables], series] = await Promise.all([
      sequelize.query(`
        SELECT count(*) AS total,
               count(*) FILTER (WHERE is_guest) AS guests,
               count(*) FILTER (WHERE status = 'banned') AS banned,
               count(*) FILTER (WHERE created_at >= now() - interval '1 day') AS "newToday",
               count(*) FILTER (WHERE last_login_at >= now() - interval '1 day') AS "activeToday"
        FROM players
      `, { type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT coalesce(sum(balance), 0)::bigint AS "inCirculation", count(*) AS wallets
        FROM wallets
      `, { type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT coalesce(sum(amount) FILTER (WHERE type = 'BET'), 0)::bigint AS staked,
               coalesce(sum(amount) FILTER (WHERE type = 'WIN'), 0)::bigint AS paid,
               coalesce(sum(amount) FILTER (WHERE type = 'REFUND'), 0)::bigint AS refunded,
               coalesce(sum(amount) FILTER (WHERE type LIKE '%BONUS'), 0)::bigint AS bonuses,
               coalesce(sum(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END) FILTER (WHERE type = 'ADMIN_ADJUST'), 0)::bigint AS "adminAdjusted",
               count(*) AS transactions,
               count(DISTINCT player_id) FILTER (WHERE type = 'BET') AS bettors
        FROM wallet_transactions
        WHERE created_at >= now() - interval '1 day'
      `, { type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT count(*) FILTER (WHERE status IN ('WAITING', 'OPEN')) AS open,
               (SELECT count(*) FROM rounds WHERE result_at >= now() - interval '1 day') AS "roundsToday",
               (SELECT count(*) FROM room_players rp JOIN rooms r ON r.room_id = rp.room_id
                 WHERE r.status IN ('WAITING', 'OPEN') AND rp.left_at IS NULL AND NOT rp.is_bot) AS "seatedPlayers"
        FROM rooms
      `, { type: QueryTypes.SELECT }),
      sequelize.query(`
        WITH day AS (
          SELECT generate_series(date_trunc('day', now()) - (:days - 1) * interval '1 day', date_trunc('day', now()), interval '1 day') AS day
        ), ledger AS (
          SELECT date_trunc('day', created_at) AS day,
                 sum(amount) FILTER (WHERE type = 'BET') AS staked,
                 sum(amount) FILTER (WHERE type = 'WIN') AS paid,
                 sum(amount) FILTER (WHERE type = 'REFUND') AS refunded,
                 sum(amount) FILTER (WHERE type LIKE '%BONUS') AS bonuses
          FROM wallet_transactions
          WHERE created_at >= date_trunc('day', now()) - (:days - 1) * interval '1 day'
          GROUP BY 1
        ), signups AS (
          SELECT date_trunc('day', created_at) AS day, count(*) AS signups
          FROM players
          WHERE created_at >= date_trunc('day', now()) - (:days - 1) * interval '1 day'
          GROUP BY 1
        )
        SELECT to_char(day.day, 'YYYY-MM-DD') AS date,
               coalesce(s.signups, 0) AS signups,
               coalesce(l.staked, 0)::bigint AS staked,
               coalesce(l.paid, 0)::bigint AS paid,
               (coalesce(l.staked, 0) - coalesce(l.paid, 0) - coalesce(l.refunded, 0))::bigint AS "houseNet",
               coalesce(l.bonuses, 0)::bigint AS bonuses
        FROM day
        LEFT JOIN ledger l ON l.day = day.day
        LEFT JOIN signups s ON s.day = day.day
        ORDER BY day.day
      `, { replacements: { days }, type: QueryTypes.SELECT })
    ])

    return {
      players,
      chips,
      last24h: { ...last24h, houseNet: last24h.staked - last24h.paid - last24h.refunded },
      tables,
      series,
      message: SUCCESS_MSG.GET_SUCCESS
    }
  }
}
