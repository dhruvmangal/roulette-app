import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { pageValidation } from '~/utils/common.utils'
import { PLAYER_SORTS } from '~/utils/constants/admin.constants'
import { PLAYER_STATUS } from '~/utils/constants/player.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    search: { type: 'string', maxLength: 100 },
    status: { enum: Object.values(PLAYER_STATUS) },
    kind: { enum: ['guest', 'registered'] },
    sort: { enum: Object.keys(PLAYER_SORTS) },
    limit: { type: ['string', 'number'] },
    pageNo: { type: ['string', 'number'] }
  }
})

/**
 * Every player with their balance, searchable by id, username or linked
 * email. A search that is all digits also matches the player id exactly.
 */
export class ListPlayersService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { search, status, kind, sort = 'newest', limit, pageNo } = this.args
    const { sequelize } = this.context
    const { pageNo: page, size } = pageValidation(pageNo, limit, 100)

    const conditions = []
    const replacements = { size, offset: (page - 1) * size }
    const term = search?.trim()
    if (term) {
      replacements.like = `%${term.replace(/[\\%_]/g, '\\$&')}%`
      const matches = ['p.username ILIKE :like', 'EXISTS (SELECT 1 FROM player_identities i WHERE i.player_id = p.player_id AND i.email ILIKE :like)']
      if (/^\d{1,9}$/.test(term)) {
        replacements.id = Number(term)
        matches.push('p.player_id = :id')
      }
      conditions.push(`(${matches.join(' OR ')})`)
    }
    if (status) {
      replacements.status = status
      conditions.push('p.status = :status')
    }
    if (kind) conditions.push(kind === 'guest' ? 'p.is_guest' : 'NOT p.is_guest')
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = await sequelize.query(`
      SELECT p.player_id AS "playerId", p.username, p.is_guest AS "isGuest", p.status, p.country,
             p.last_login_at AS "lastLoginAt", p.created_at AS "createdAt",
             w.balance,
             (SELECT array_agg(i.provider ORDER BY i.player_identity_id) FROM player_identities i WHERE i.player_id = p.player_id) AS providers,
             (SELECT i.email FROM player_identities i WHERE i.player_id = p.player_id AND i.email IS NOT NULL ORDER BY i.player_identity_id LIMIT 1) AS email,
             count(*) OVER () AS "totalCount"
      FROM players p
      LEFT JOIN wallets w ON w.player_id = p.player_id
      ${where}
      ORDER BY ${PLAYER_SORTS[sort]}, p.player_id DESC
      LIMIT :size OFFSET :offset
    `, { replacements, type: QueryTypes.SELECT })

    const count = rows[0]?.totalCount ?? 0
    const players = rows.map(({ totalCount, providers, ...row }) => ({ ...row, providers: providers ?? [] }))
    return { players, count, pageNo: page, limit: size, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
