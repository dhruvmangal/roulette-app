import pickBy from 'lodash/pickBy'
import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { pageValidation } from '~/utils/common.utils'
import { ADMIN_TARGETS } from '~/utils/constants/admin.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    targetType: { enum: Object.values(ADMIN_TARGETS) },
    targetId: { type: 'string', maxLength: 64 },
    limit: { type: ['string', 'number'] },
    pageNo: { type: ['string', 'number'] }
  }
})

/** What admins changed, newest first; optionally only for one player or bonus. */
export class ListAuditLogsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { targetType, targetId, limit, pageNo } = this.args
    const { sequelize } = this.context
    const { pageNo: page, size } = pageValidation(pageNo, limit, 100)

    const conditions = []
    if (targetType) conditions.push('l.target_type = :targetType')
    if (targetId) conditions.push('l.target_id = :targetId')
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = await sequelize.query(`
      SELECT l.admin_audit_log_id AS "adminAuditLogId", l.action, l.target_type AS "targetType", l.target_id AS "targetId",
             l.details, l.created_at AS "createdAt", a.email AS "adminEmail", a.name AS "adminName",
             count(*) OVER () AS "totalCount"
      FROM admin_audit_logs l
      JOIN admin_users a ON a.admin_user_id = l.admin_user_id
      ${where}
      ORDER BY l.admin_audit_log_id DESC
      LIMIT :size OFFSET :offset
    `, { replacements: { ...pickBy({ targetType, targetId }, Boolean), size, offset: (page - 1) * size }, type: QueryTypes.SELECT })

    const count = rows[0]?.totalCount ?? 0
    return { logs: rows.map(({ totalCount, ...row }) => row), count, pageNo: page, limit: size, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
