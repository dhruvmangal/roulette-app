import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { pageValidation } from '~/utils/common.utils'
import { SUCCESS_MSG } from '~/utils/constants/success'

const constraints = ajv.compile({
  type: 'object',
  properties: { limit: { type: ['string', 'number'] }, pageNo: { type: ['string', 'number'] } }
})

// A broadcast that has been "sending" this long was cut off (the server restarted).
const STALLED_AFTER_MS = 30 * 60 * 1000

/** What admins have sent, newest first, with who sent it and how it went. */
export class ListAnnouncementsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { limit, pageNo } = this.args
    const { sequelize } = this.context
    const { pageNo: page, size } = pageValidation(pageNo, limit, 100)

    const rows = await sequelize.query(`
      SELECT a.announcement_id AS "announcementId", a.title, a.body, a.audience, a.audience_days AS "audienceDays",
             a.audience_player_id AS "audiencePlayerId", a.status, a.targeted, a.sent, a.skipped, a.error,
             a.created_at AS "createdAt", a.finished_at AS "finishedAt", u.name AS "adminName", u.email AS "adminEmail",
             count(*) OVER () AS "totalCount"
      FROM announcements a JOIN admin_users u ON u.admin_user_id = a.admin_user_id
      ORDER BY a.created_at DESC, a.announcement_id DESC
      LIMIT :size OFFSET :offset
    `, { replacements: { size, offset: (page - 1) * size }, type: QueryTypes.SELECT })

    const now = Date.now()
    return {
      announcements: rows.map(({ totalCount, ...row }) => ({
        ...row,
        stalled: row.status === 'SENDING' && now - new Date(row.createdAt).getTime() > STALLED_AFTER_MS
      })),
      count: rows[0]?.totalCount ?? 0,
      pageNo: page,
      limit: size,
      message: SUCCESS_MSG.GET_SUCCESS
    }
  }
}
