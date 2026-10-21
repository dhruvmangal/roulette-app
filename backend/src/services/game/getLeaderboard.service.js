import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'

export const LEADERBOARD_PERIODS = { day: '1 day', week: '7 days', all: null }
const TOP = 50

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    period: { enum: Object.keys(LEADERBOARD_PERIODS) }
  },
  required: ['playerId', 'period']
})

/**
 * Players ranked by net winnings over a period (payouts minus stakes on
 * settled bets), with the asking player's own rank even if outside the top.
 */
export class GetLeaderboardService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, period } = this.args
    const { sequelize } = this.context
    const since = LEADERBOARD_PERIODS[period]

    const ranked = await sequelize.query(`
      WITH totals AS (
        SELECT b.player_id,
               sum(b.payout - b.amount)::bigint AS net,
               count(DISTINCT b.round_id) AS rounds,
               coalesce(max(b.payout - b.amount) FILTER (WHERE b.status = 'WON'), 0) AS "biggestWin"
        FROM bets b
        JOIN rounds r ON r.round_id = b.round_id
        WHERE b.player_id IS NOT NULL AND b.status IN ('WON', 'LOST')
          AND (CAST(:since AS interval) IS NULL OR r.result_at >= now() - CAST(:since AS interval))
        GROUP BY b.player_id
      ), ranked AS (
        SELECT rank() OVER (ORDER BY t.net DESC) AS rank, t.player_id AS "playerId", p.username, t.net, t.rounds, t."biggestWin"
        FROM totals t
        JOIN players p ON p.player_id = t.player_id AND p.status = 'active'
      )
      SELECT * FROM ranked WHERE rank <= :top OR "playerId" = :playerId ORDER BY rank, username
    `, { replacements: { since, top: TOP, playerId }, type: QueryTypes.SELECT })

    return {
      period,
      entries: ranked.filter(row => row.rank <= TOP),
      me: ranked.find(row => row.playerId === playerId) ?? null,
      message: SUCCESS_MSG.GET_SUCCESS
    }
  }
}
