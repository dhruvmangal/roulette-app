import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { pageValidation } from '~/utils/common.utils'
import { SUCCESS_MSG } from '~/utils/constants/success'

const constraints = ajv.compile({
  type: 'object',
  properties: { limit: { type: ['string', 'number'] }, pageNo: { type: ['string', 'number'] } }
})

/** Reported chat messages, most recently reported first, one row per message. */
export class ListChatReportsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { limit, pageNo } = this.args
    const { sequelize } = this.context
    const { pageNo: page, size } = pageValidation(pageNo, limit, 100)

    const rows = await sequelize.query(`
      SELECT m.chat_message_id AS "chatMessageId", m.text, m.created_at AS "sentAt",
             m.player_id AS "playerId", author.username, author.status AS "playerStatus",
             r.room_id AS "roomId", r.code AS "roomCode",
             count(cr.chat_report_id) AS reports,
             max(cr.created_at) AS "lastReportedAt",
             array_agg(reporter.username ORDER BY cr.created_at) AS reporters,
             count(*) OVER () AS "totalCount"
      FROM chat_reports cr
      JOIN chat_messages m ON m.chat_message_id = cr.chat_message_id
      JOIN players author ON author.player_id = m.player_id
      JOIN players reporter ON reporter.player_id = cr.reporter_player_id
      JOIN rooms r ON r.room_id = m.room_id
      GROUP BY m.chat_message_id, author.player_id, r.room_id
      ORDER BY max(cr.created_at) DESC
      LIMIT :size OFFSET :offset
    `, { replacements: { size, offset: (page - 1) * size }, type: QueryTypes.SELECT })

    const count = rows[0]?.totalCount ?? 0
    return { reports: rows.map(({ totalCount, ...row }) => row), count, pageNo: page, limit: size, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
