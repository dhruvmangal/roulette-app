import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { INSIDE_BET_TYPES, houseEdge, replayWithAlternatives, safeTimeZone, shareBeaten, summarizeStreaks } from '~/utils/stats.utils'

const DAY_MS = 24 * 60 * 60 * 1000
export const STATS_PERIODS = { week: 7 * DAY_MS, month: 30 * DAY_MS, all: null }

// Other players are only compared with once a player has this many rounds, and only against
// players with this many, so a single lucky round can't top a chart.
export const COMMUNITY_MIN_ROUNDS = 5
// The what-if replay looks at this many of the period's latest rounds.
const REPLAY_ROUNDS = 3000

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    period: { enum: Object.keys(STATS_PERIODS) },
    timeZone: { type: ['string', 'null'] }
  },
  required: ['playerId', 'period']
})

// The player's settled bets in the period; every query below starts from it.
const SETTLED_BETS = `
  SELECT b.round_id, b.bet_type, b.selection, b.amount, b.payout, b.status, r.result_at, rm.room_id, rm.variant
  FROM bets b
  JOIN rounds r ON r.round_id = b.round_id
  JOIN rooms rm ON rm.room_id = r.room_id
  WHERE b.player_id = :playerId AND b.status IN ('WON', 'LOST')
    AND (CAST(:from AS timestamptz) IS NULL OR r.result_at >= CAST(:from AS timestamptz))
    AND (CAST(:to AS timestamptz) IS NULL OR r.result_at < CAST(:to AS timestamptz))
`

const PER_ROUND = `
  SELECT round_id, room_id, result_at, sum(amount) AS staked, sum(payout - amount) AS net
  FROM settled GROUP BY round_id, room_id, result_at
`

/**
 * How the player bets at online tables over a period: totals, which bets
 * they favour and how each paid off, net over time, when they play, streaks,
 * and how their result compares with what the house edge predicts.
 */
export class GetPlayerStatsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, period } = this.args
    const { sequelize } = this.context
    const timeZone = safeTimeZone(this.args.timeZone)
    const length = STATS_PERIODS[period]
    const now = Date.now()
    const window = (from, to) => ({ playerId, timeZone, from: from === null ? null : new Date(from), to: to === null ? null : new Date(to) })
    const replacements = window(length === null ? null : now - length, null)
    const query = (sql, values) => sequelize.query(`WITH settled AS (${SETTLED_BETS}), per_round AS (${PER_ROUND}) ${sql}`, { replacements: values, type: QueryTypes.SELECT })
    const select = (sql) => query(sql, replacements)

    const [[summary], byVariantAndType, daily, hours, numbers, runs, [before], replayRounds, [crowd]] = await Promise.all([
      select(`
        SELECT count(*)::int AS rounds,
               count(*) FILTER (WHERE net > 0)::int AS "roundsWon",
               count(*) FILTER (WHERE net < 0)::int AS "roundsLost",
               count(DISTINCT room_id)::int AS tables,
               coalesce(sum(staked), 0)::bigint AS staked,
               coalesce(sum(net), 0)::bigint AS net,
               coalesce(max(net) FILTER (WHERE net > 0), 0)::bigint AS "biggestWin",
               coalesce(min(net) FILTER (WHERE net < 0), 0)::bigint AS "biggestLoss",
               min(result_at) AS "firstPlayedAt", max(result_at) AS "lastPlayedAt"
        FROM per_round
      `),
      select(`
        SELECT variant, bet_type AS "betType", count(*)::int AS bets, count(*) FILTER (WHERE status = 'WON')::int AS wins,
               sum(amount)::bigint AS staked, sum(payout)::bigint AS returned
        FROM settled GROUP BY variant, bet_type
      `),
      select(`
        SELECT to_char(date_trunc('day', result_at AT TIME ZONE :timeZone), 'YYYY-MM-DD') AS day,
               count(*)::int AS rounds, sum(staked)::bigint AS staked, sum(net)::bigint AS net
        FROM per_round GROUP BY 1 ORDER BY 1
      `),
      select(`
        SELECT extract(hour FROM result_at AT TIME ZONE :timeZone)::int AS hour, count(*)::int AS rounds
        FROM per_round GROUP BY 1
      `),
      select(`
        SELECT selection->'pockets'->>0 AS pocket, count(*)::int AS bets, count(*) FILTER (WHERE status = 'WON')::int AS hits,
               sum(amount)::bigint AS staked
        FROM settled WHERE bet_type = 'STRAIGHT'
        GROUP BY 1 ORDER BY bets DESC, staked DESC LIMIT 6
      `),
      // Runs of consecutive rounds with the same outcome (gaps and islands).
      select(`
        SELECT sign, count(*)::int AS length, max(result_at) AS "endedAt"
        FROM (
          SELECT sign(net)::int AS sign, result_at,
                 row_number() OVER (ORDER BY result_at) - row_number() OVER (PARTITION BY sign(net) ORDER BY result_at) AS island
          FROM per_round
        ) outcomes
        GROUP BY sign, island
      `),
      // The same-length stretch just before this one, for "compared with last time".
      length === null
        ? [null]
        : query(`
          SELECT count(*)::int AS rounds, count(*) FILTER (WHERE net > 0)::int AS "roundsWon",
                 coalesce(sum(staked), 0)::bigint AS staked, coalesce(sum(net), 0)::bigint AS net
          FROM per_round
        `, window(now - 2 * length, now - length)),
      // The period's real spins and what was staked on each, to replay with other bets.
      select(`
        SELECT s.variant, r.winning_pocket AS "winningPocket", s.staked::bigint AS staked
        FROM (SELECT round_id, variant, sum(amount) AS staked FROM settled GROUP BY round_id, variant) s
        JOIN rounds r ON r.round_id = s.round_id
        ORDER BY r.result_at DESC LIMIT ${REPLAY_ROUNDS}
      `),
      // Every other active player over the same stretch, in aggregate (no names).
      sequelize.query(`
        WITH totals AS (
          SELECT b.player_id, count(DISTINCT b.round_id) AS rounds, sum(b.payout - b.amount) AS net, sum(b.amount) AS staked
          FROM bets b
          JOIN rounds r ON r.round_id = b.round_id
          JOIN players p ON p.player_id = b.player_id AND p.status = 'active'
          WHERE b.player_id IS NOT NULL AND b.status IN ('WON', 'LOST')
            AND (CAST(:from AS timestamptz) IS NULL OR r.result_at >= CAST(:from AS timestamptz))
          GROUP BY b.player_id
          HAVING count(DISTINCT b.round_id) >= :minRounds
        )
        SELECT count(*)::int AS players,
               coalesce(array_agg(net) FILTER (WHERE player_id <> :playerId), '{}') AS "otherNets",
               coalesce(array_agg((staked + net)::float / staked) FILTER (WHERE player_id <> :playerId), '{}') AS "otherReturns",
               percentile_cont(0.5) WITHIN GROUP (ORDER BY rounds) AS "medianRounds",
               percentile_cont(0.5) WITHIN GROUP (ORDER BY staked::float / rounds) AS "medianStake",
               percentile_cont(0.5) WITHIN GROUP (ORDER BY net) AS "medianNet"
        FROM totals
      `, { replacements: { ...replacements, minRounds: COMMUNITY_MIN_ROUNDS }, type: QueryTypes.SELECT })
    ])

    const types = new Map()
    let expectedNet = 0
    let insideStaked = 0
    for (const row of byVariantAndType) {
      const staked = Number(row.staked)
      const returned = Number(row.returned)
      expectedNet -= staked * houseEdge(row.variant, row.betType)
      if (INSIDE_BET_TYPES.includes(row.betType)) insideStaked += staked
      const total = types.get(row.betType) ?? { betType: row.betType, bets: 0, wins: 0, staked: 0, returned: 0, net: 0 }
      total.bets += row.bets
      total.wins += row.wins
      total.staked += staked
      total.returned += returned
      total.net += returned - staked
      types.set(row.betType, total)
    }

    const staked = Number(summary.staked)
    const net = Number(summary.net)
    const roundsByHour = Array.from({ length: 24 }, (_, hour) => hours.find(row => row.hour === hour)?.rounds ?? 0)

    return {
      period,
      timeZone,
      summary: {
        ...summary,
        staked,
        net,
        biggestWin: Number(summary.biggestWin),
        biggestLoss: Number(summary.biggestLoss),
        bets: byVariantAndType.reduce((sum, row) => sum + row.bets, 0),
        returnRate: staked ? (staked + net) / staked : null,
        averageStake: summary.rounds ? Math.round(staked / summary.rounds) : 0,
        insideShare: staked ? insideStaked / staked : null,
        expectedNet: Math.round(expectedNet)
      },
      betTypes: [...types.values()].sort((a, b) => b.staked - a.staked),
      daily: daily.map(row => ({ ...row, staked: Number(row.staked), net: Number(row.net) })),
      roundsByHour,
      favouriteNumbers: numbers.map(row => ({ ...row, staked: Number(row.staked) })),
      streaks: summarizeStreaks(runs),
      previous: before && length !== null && before.rounds > 0
        ? { rounds: before.rounds, roundsWon: before.roundsWon, staked: Number(before.staked), net: Number(before.net), returnRate: Number(before.staked) ? (Number(before.staked) + Number(before.net)) / Number(before.staked) : null }
        : null,
      whatIf: replayWithAlternatives(replayRounds.map(row => ({ ...row, staked: Number(row.staked) }))),
      community: this.#community(crowd, summary, staked, net),
      message: SUCCESS_MSG.GET_SUCCESS
    }
  }

  /** Where the player stands among the others over the same period; null while there's no one to compare with. */
  #community (crowd, summary, staked, net) {
    if (!crowd || summary.rounds < COMMUNITY_MIN_ROUNDS || crowd.players < 2) return null
    const returnRate = staked ? (staked + net) / staked : 0
    return {
      players: crowd.players,
      minRounds: COMMUNITY_MIN_ROUNDS,
      netBeaten: shareBeaten(net, crowd.otherNets.map(Number)),
      returnBeaten: shareBeaten(returnRate, crowd.otherReturns.map(Number)),
      medianNet: Math.round(Number(crowd.medianNet)),
      medianRounds: Math.round(Number(crowd.medianRounds)),
      medianStake: Math.round(Number(crowd.medianStake))
    }
  }
}
