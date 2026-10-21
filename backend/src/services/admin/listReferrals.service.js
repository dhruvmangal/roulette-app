import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { pageValidation } from '~/utils/common.utils'
import { REFERRAL_STATUS } from '~/utils/constants/referral.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    status: { enum: Object.values(REFERRAL_STATUS) },
    // Referrals this player made or arrived through.
    playerId: { type: 'integer', minimum: 1 },
    limit: { type: ['string', 'number'] },
    pageNo: { type: ['string', 'number'] }
  }
})

/**
 * Who referred whom, newest first: the friend's progress while pending, what
 * was paid once rewarded, and why a referral was rejected. The totals cover
 * every referral, not just this page or filter.
 */
export class ListReferralsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { status = null, playerId = null, limit, pageNo } = this.args
    const { sequelize } = this.context
    const { pageNo: page, size } = pageValidation(pageNo, limit, 100)

    const [rows, [totals]] = await Promise.all([
      sequelize.query(`
        SELECT rf.referral_id AS "referralId", rf.status, rf.reject_reason AS "rejectReason", rf.code,
               rf.referrer_reward AS "referrerReward", rf.referee_reward AS "refereeReward",
               rf.created_at AS "createdAt", rf.rewarded_at AS "rewardedAt",
               rf.referrer_id AS "referrerId", referrer.username AS "referrerUsername", referrer.status AS "referrerStatus",
               rf.referee_id AS "refereeId", referee.username AS "refereeUsername", referee.status AS "refereeStatus",
               NOT referee.is_guest AS "refereeSaved",
               (SELECT count(DISTINCT b.round_id) FROM bets b WHERE b.player_id = rf.referee_id AND b.status IN ('WON', 'LOST'))::int AS "refereeRounds",
               count(*) OVER () AS "totalCount"
        FROM referrals rf
        JOIN players referrer ON referrer.player_id = rf.referrer_id
        JOIN players referee ON referee.player_id = rf.referee_id
        WHERE (CAST(:status AS text) IS NULL OR rf.status = :status)
          AND (CAST(:playerId AS integer) IS NULL OR rf.referrer_id = :playerId OR rf.referee_id = :playerId)
        ORDER BY rf.created_at DESC, rf.referral_id DESC
        LIMIT :size OFFSET :offset
      `, { replacements: { status, playerId, size, offset: (page - 1) * size }, type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE status = 'PENDING')::int AS pending,
               count(*) FILTER (WHERE status = 'REWARDED')::int AS rewarded,
               count(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
               coalesce(sum(referrer_reward + referee_reward), 0)::bigint AS "chipsPaid",
               count(DISTINCT referrer_id)::int AS referrers
        FROM referrals
      `, { type: QueryTypes.SELECT })
    ])

    const count = rows[0]?.totalCount ?? 0
    return {
      referrals: rows.map(({ totalCount, ...row }) => ({ ...row, referrerReward: Number(row.referrerReward), refereeReward: Number(row.refereeReward) })),
      totals: { ...totals, chipsPaid: Number(totals.chipsPaid) },
      count,
      pageNo: page,
      limit: size,
      message: SUCCESS_MSG.GET_SUCCESS
    }
  }
}
