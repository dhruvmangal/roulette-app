import { QueryTypes } from 'sequelize'
import { ANNOUNCEMENT_AUDIENCES, NOTIFICATION_CATEGORIES } from '~/utils/constants/notification.constants'

/**
 * The SQL that picks who an announcement goes to: active players with at least one phone set
 * up and who haven't switched announcements off. The audience is the only part that varies,
 * and it only ever puts values into placeholders.
 */
const audienceClause = (audience) => {
  switch (audience) {
    case ANNOUNCEMENT_AUDIENCES.ALL: return 'TRUE'
    // Last signed in more than N days ago.
    case ANNOUNCEMENT_AUDIENCES.INACTIVE: return "COALESCE(p.last_login_at, p.created_at) < now() - (CAST(:days AS integer) * interval '1 day')"
    case ANNOUNCEMENT_AUDIENCES.PLAYER: return 'p.player_id = CAST(:playerId AS integer)'
    default: throw new Error(`Unknown audience "${audience}"`)
  }
}

const FROM = `
  FROM players p
  JOIN push_tokens t ON t.player_id = p.player_id
  WHERE p.status = 'active'
    AND COALESCE((p.notification_prefs ->> '${NOTIFICATION_CATEGORIES.ANNOUNCEMENTS}')::boolean, true)
`

const replacements = ({ days = null, playerId = null }) => ({ days, playerId })

/** How many players, and how many of their phones, an audience reaches right now. */
export const audienceReach = async (sequelize, { audience, days, playerId }) => {
  const [row] = await sequelize.query(
    `SELECT count(DISTINCT p.player_id)::int AS players, count(*)::int AS phones ${FROM} AND ${audienceClause(audience)}`,
    { replacements: replacements({ days, playerId }), type: QueryTypes.SELECT }
  )
  return row
}

/** One page of player ids in the audience, after `afterId`, so a long list is read in chunks. */
export const audiencePlayerIds = async (sequelize, { audience, days, playerId }, afterId, limit) => {
  const rows = await sequelize.query(
    `SELECT DISTINCT p.player_id AS "playerId" ${FROM} AND ${audienceClause(audience)} AND p.player_id > :afterId ORDER BY p.player_id LIMIT :limit`,
    { replacements: { ...replacements({ days, playerId }), afterId, limit }, type: QueryTypes.SELECT }
  )
  return rows.map(row => row.playerId)
}

/** Why one player can't be reached, for a message to a single player that is going nowhere. */
export const whyUnreachable = async (sequelize, playerId) => {
  const [row] = await sequelize.query(`
    SELECT p.status, p.notification_prefs AS prefs, (SELECT count(*) FROM push_tokens t WHERE t.player_id = p.player_id)::int AS phones
    FROM players p WHERE p.player_id = :playerId
  `, { replacements: { playerId }, type: QueryTypes.SELECT })
  if (!row) return 'no-player'
  if (row.status !== 'active') return 'not-active'
  if (!row.phones) return 'no-devices'
  if (row.prefs?.[NOTIFICATION_CATEGORIES.ANNOUNCEMENTS] === false) return 'opted-out'
  return null
}
