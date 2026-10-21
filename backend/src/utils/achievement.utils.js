import { QueryTypes } from 'sequelize'
import { ACHIEVEMENTS, STREAK_LOOKBACK } from '~/utils/constants/achievement.constants'

/** Rounds won in a row, counting back from the most recent. `nets` are per-round results, newest first. */
export const currentWinStreak = (nets) => {
  let streak = 0
  for (const net of nets) {
    if (Number(net) > 0) streak++
    else break
  }
  return streak
}

/** Achievements not yet earned whose target is met, from the metrics worked out so far. */
export const reached = (metrics, alreadyEarned, groups) => {
  const earned = new Set(alreadyEarned)
  return ACHIEVEMENTS.filter(achievement =>
    (!groups || groups.includes(achievement.group)) && !earned.has(achievement.code) && Number(metrics[achievement.metric] ?? 0) >= achievement.target
  )
}

const queries = {
  // Everything about the rounds a player has played online.
  async play (sequelize, playerId) {
    const [stats] = await sequelize.query(`
      WITH settled AS (
        SELECT b.round_id, b.bet_type, b.selection, b.amount, b.payout, b.status, rm.variant
        FROM bets b
        JOIN rounds r ON r.round_id = b.round_id
        JOIN rooms rm ON rm.room_id = r.room_id
        WHERE b.player_id = :playerId AND b.status IN ('WON', 'LOST')
      ), per_round AS (
        SELECT round_id, sum(payout - amount) AS net FROM settled GROUP BY round_id
      )
      SELECT (SELECT count(*) FROM per_round)::int AS rounds,
             (SELECT count(*) FROM per_round WHERE net > 0)::int AS "roundsWon",
             (SELECT count(DISTINCT bet_type) FROM settled)::int AS "betTypes",
             (SELECT count(DISTINCT variant) FROM settled)::int AS variants,
             (SELECT count(*) FROM settled WHERE status = 'WON' AND bet_type = 'STRAIGHT')::int AS "straightWins",
             (SELECT count(*) FROM settled WHERE status = 'WON' AND bet_type = 'STRAIGHT' AND selection->'pockets'->>0 IN ('0', '00'))::int AS "zeroWins",
             coalesce((SELECT max(payout - amount) FROM settled WHERE status = 'WON'), 0)::bigint AS "bigWin"
    `, { replacements: { playerId }, type: QueryTypes.SELECT })
    const recent = await sequelize.query(`
      SELECT sum(b.payout - b.amount)::bigint AS net
      FROM bets b JOIN rounds r ON r.round_id = b.round_id
      WHERE b.player_id = :playerId AND b.status IN ('WON', 'LOST')
      GROUP BY r.round_id, r.result_at
      ORDER BY r.result_at DESC, r.round_id DESC
      LIMIT :lookback
    `, { replacements: { playerId, lookback: STREAK_LOOKBACK }, type: QueryTypes.SELECT })
    return { ...stats, bigWin: Number(stats.bigWin), winStreak: currentWinStreak(recent.map(row => row.net)) }
  },

  // Private tables this player hosted that someone else sat down at.
  async hosted (sequelize, playerId) {
    const [row] = await sequelize.query(`
      SELECT count(*)::int AS "hostedWithFriend"
      FROM rooms r
      WHERE r.host_player_id = :playerId AND r.mode = 'PRIVATE'
        AND (SELECT count(DISTINCT rp.player_id) FROM room_players rp WHERE rp.room_id = r.room_id AND NOT rp.is_bot) >= 2
    `, { replacements: { playerId }, type: QueryTypes.SELECT })
    return row
  },

  async friends (sequelize, playerId) {
    const [row] = await sequelize.query(`
      SELECT count(*)::int AS friends FROM friendships
      WHERE status = 'ACCEPTED' AND (requester_id = :playerId OR addressee_id = :playerId)
    `, { replacements: { playerId }, type: QueryTypes.SELECT })
    return row
  },

  async referrals (sequelize, playerId) {
    const [row] = await sequelize.query(`
      SELECT count(*)::int AS "referralsRewarded" FROM referrals WHERE referrer_id = :playerId AND status = 'REWARDED'
    `, { replacements: { playerId }, type: QueryTypes.SELECT })
    return row
  },

  async daily (sequelize, playerId) {
    const [row] = await sequelize.query(`
      SELECT coalesce(max(pb.streak_day), 0)::int AS "dailyStreak"
      FROM player_bonuses pb JOIN bonuses b ON b.bonus_id = pb.bonus_id
      WHERE pb.player_id = :playerId AND b.type = 'DAILY'
    `, { replacements: { playerId }, type: QueryTypes.SELECT })
    return row
  }
}

/** The numbers achievements are judged on, for the groups asked about (all of them if none are). */
export const computeMetrics = async (sequelize, playerId, groups = Object.keys(queries)) => {
  const parts = await Promise.all(groups.filter(group => queries[group]).map(group => queries[group](sequelize, playerId)))
  return Object.assign({}, ...parts)
}
