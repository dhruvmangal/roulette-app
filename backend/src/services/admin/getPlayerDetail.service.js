import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { toProfile, toWalletView } from '~/utils/player.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: { playerId: { type: 'integer', minimum: 1 } },
  required: ['playerId']
})

/**
 * One player as support sees them: account, wallet, linked logins, play and
 * bonus totals, devices and recent visits, and other accounts seen on the
 * same device or IP (a hint of one person running several accounts).
 */
export class GetPlayerDetailService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId } = this.args
    const { dbModels: { Player, PlayerIdentity, Wallet }, sequelize } = this.context

    const [player, wallet, identities, [play], [ledger], [sessions], seats, devices, visits, linked, [referrals]] = await Promise.all([
      Player.findByPk(playerId),
      Wallet.findOne({ where: { playerId } }),
      PlayerIdentity.findAll({ where: { playerId }, order: [['playerIdentityId', 'ASC']] }),
      sequelize.query(`
        SELECT count(DISTINCT round_id) AS rounds,
               count(*) AS bets,
               coalesce(sum(amount), 0)::bigint AS staked,
               coalesce(sum(payout), 0)::bigint AS returned,
               coalesce(sum(payout - amount), 0)::bigint AS net,
               coalesce(max(payout - amount) FILTER (WHERE status = 'WON'), 0)::bigint AS "biggestWin",
               max(created_at) AS "lastBetAt"
        FROM bets
        WHERE player_id = :playerId AND status IN ('WON', 'LOST')
      `, { replacements: { playerId }, type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT coalesce(sum(amount) FILTER (WHERE type LIKE '%BONUS'), 0)::bigint AS bonuses,
               coalesce(sum(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END) FILTER (WHERE type = 'ADMIN_ADJUST'), 0)::bigint AS "adminAdjusted",
               count(*) AS transactions
        FROM wallet_transactions
        WHERE player_id = :playerId
      `, { replacements: { playerId }, type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT count(*) FILTER (WHERE revoked_at IS NULL AND expires_at > now()) AS active,
               max(created_at) AS "lastRefreshAt"
        FROM player_sessions
        WHERE player_id = :playerId
      `, { replacements: { playerId }, type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT r.room_id AS "roomId", r.code, r.mode, r.variant, rp.seat, rp.joined_at AS "joinedAt", rp.away_since AS "awaySince"
        FROM room_players rp
        JOIN rooms r ON r.room_id = rp.room_id
        WHERE rp.player_id = :playerId AND rp.left_at IS NULL AND r.status IN ('WAITING', 'OPEN')
        ORDER BY rp.joined_at DESC
      `, { replacements: { playerId }, type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT player_device_id AS "playerDeviceId", device_id AS "deviceId", platform, device_type AS "deviceType",
               device_vendor AS "deviceVendor", device_model AS "deviceModel", is_virtual AS "isVirtual",
               os_name AS "osName", os_version AS "osVersion", browser_name AS "browserName", browser_version AS "browserVersion",
               app_version AS "appVersion", screen_width AS "screenWidth", screen_height AS "screenHeight", pixel_ratio AS "pixelRatio",
               language, timezone, visits, first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt"
        FROM player_devices WHERE player_id = :playerId
        ORDER BY last_seen_at DESC
      `, { replacements: { playerId }, type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT v.player_visit_id AS "playerVisitId", v.ip, v.country, v.region, v.city, v.latitude::float AS latitude, v.longitude::float AS longitude,
               v.network_type AS "networkType", v.network_quality AS "networkQuality", v.orientation, v.created_at AS "createdAt",
               d.platform, d.device_model AS "deviceModel", d.os_name AS "osName", d.browser_name AS "browserName"
        FROM player_visits v JOIN player_devices d ON d.player_device_id = v.player_device_id
        WHERE v.player_id = :playerId
        ORDER BY v.player_visit_id DESC
        LIMIT 25
      `, { replacements: { playerId }, type: QueryTypes.SELECT }),
      // Other accounts seen on one of this player's devices, or from one of their IPs lately.
      sequelize.query(`
        WITH mine AS (
          SELECT device_id FROM player_devices WHERE player_id = :playerId
        ), my_ips AS (
          SELECT DISTINCT ip FROM player_visits WHERE player_id = :playerId AND ip IS NOT NULL
        ), shared AS (
          SELECT d.player_id, 'device' AS via, d.device_id AS value FROM player_devices d
           WHERE d.device_id IN (SELECT device_id FROM mine) AND d.player_id <> :playerId
          UNION
          SELECT v.player_id, 'ip' AS via, v.ip AS value FROM player_visits v
           WHERE v.ip IN (SELECT ip FROM my_ips) AND v.player_id <> :playerId
        )
        SELECT p.player_id AS "playerId", p.username, p.status, p.is_guest AS "isGuest",
               array_agg(DISTINCT s.via) AS via, count(DISTINCT s.value) AS matches
        FROM shared s JOIN players p ON p.player_id = s.player_id
        GROUP BY p.player_id
        ORDER BY bool_or(s.via = 'device') DESC, count(DISTINCT s.value) DESC, p.player_id DESC
        LIMIT 50
      `, { replacements: { playerId }, type: QueryTypes.SELECT }),
      // Refer & earn: who sent this player, and how their own referrals are going.
      sequelize.query(`
        SELECT p.referral_code AS code,
               (SELECT json_build_object('playerId', r.referrer_id, 'username', u.username, 'status', r.status, 'rejectReason', r.reject_reason)
                  FROM referrals r JOIN players u ON u.player_id = r.referrer_id WHERE r.referee_id = p.player_id) AS "referredBy",
               (SELECT count(*) FROM referrals WHERE referrer_id = p.player_id)::int AS made,
               (SELECT count(*) FROM referrals WHERE referrer_id = p.player_id AND status = 'REWARDED')::int AS rewarded,
               (SELECT coalesce(sum(referrer_reward), 0) FROM referrals WHERE referrer_id = p.player_id)::bigint AS earned
        FROM players p WHERE p.player_id = :playerId
      `, { replacements: { playerId }, type: QueryTypes.SELECT })
    ])
    if (!player) return this.addError('PlayerNotFoundErrorType', `#${playerId}`)

    return {
      player: { ...toProfile(player, identities), tokenVersion: player.tokenVersion },
      wallet: wallet ? toWalletView(wallet) : null,
      identities: identities.map(({ provider, email, lastUsedAt, createdAt }) => ({ provider, email, lastUsedAt, createdAt })),
      stats: { ...play, ...ledger, activeSessions: sessions.active, lastRefreshAt: sessions.lastRefreshAt },
      seats,
      devices,
      visits,
      linkedAccounts: linked,
      referrals: referrals && { ...referrals, earned: Number(referrals.earned) },
      message: SUCCESS_MSG.GET_SUCCESS
    }
  }
}
