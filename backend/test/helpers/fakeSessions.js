/**
 * In-memory Player and PlayerSession models, enough for the session
 * services. Queries are matched by the fields those services use.
 */
export function fakeSessions () {
  const players = new Map()
  const sessions = []

  const instance = (row) => {
    const copy = { ...row }
    copy.update = async (values) => Object.assign(copy, Object.assign(row, values))
    return copy
  }
  const live = (where) => (row) => row.revokedAt === null &&
    (where.familyId === undefined || row.familyId === where.familyId) &&
    (where.playerId === undefined || row.playerId === where.playerId)

  const Player = {
    findByPk: async (playerId) => players.has(playerId) ? instance(players.get(playerId)) : null,
    findOne: async () => null
  }

  const PlayerSession = {
    create: async (values) => {
      const row = { playerSessionId: sessions.length + 1, revokedAt: null, replacedBySessionId: null, ...values }
      sessions.push(row)
      return instance(row)
    },
    findOne: async ({ where: { tokenHash } }) => {
      const row = sessions.find(session => session.tokenHash === tokenHash)
      return row ? instance(row) : null
    },
    // Only ever called to revoke the live sessions of a family or a player.
    update: async (values, { where }) => {
      sessions.filter(live(where)).forEach(row => Object.assign(row, values))
    }
  }

  const PlayerIdentity = { findAll: async () => [] }

  const sequelize = { transaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }) }

  return {
    context: { dbModels: { Player, PlayerIdentity, PlayerSession }, sequelize },
    players,
    sessions,
    addPlayer: (player) => players.set(player.playerId, { status: 'active', tokenVersion: 0, isGuest: false, ...player })
  }
}
