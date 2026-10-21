import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import { onlinePlayerIds } from '~/libs/presence'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'

const constraints = ajv.compile({ type: 'object', properties: { playerId: { type: 'integer', minimum: 1 } }, required: ['playerId'] })

/**
 * The player's friends (online ones first, with the table they're at), the
 * requests waiting for their answer, and the ones they've sent. A friend's
 * table is only shown while they are connected: a seat they've walked away
 * from isn't somewhere to join them.
 */
export class ListFriendsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId } = this.args
    const { sequelize } = this.context

    const [friends, requests, online] = await Promise.all([
      sequelize.query(`
        SELECT p.player_id AS "playerId", p.username, f.responded_at AS "since", p.last_login_at AS "lastSeenAt",
               t.code AS "tableCode", t.variant AS "tableVariant", t.mode AS "tableMode", t.seated AS "tableSeated", t.max_seats AS "tableMaxSeats"
        FROM friendships f
        JOIN players p ON p.player_id = CASE WHEN f.requester_id = :playerId THEN f.addressee_id ELSE f.requester_id END
        LEFT JOIN LATERAL (
          SELECT r.code, r.variant, r.mode, r.max_seats,
                 (SELECT count(*) FROM room_players x WHERE x.room_id = r.room_id AND x.left_at IS NULL)::int AS seated
          FROM room_players rp JOIN rooms r ON r.room_id = rp.room_id
          WHERE rp.player_id = p.player_id AND rp.left_at IS NULL AND r.status IN ('WAITING', 'OPEN') AND r.mode <> 'VS_COMPUTER'
          ORDER BY rp.joined_at DESC LIMIT 1
        ) t ON true
        WHERE (f.requester_id = :playerId OR f.addressee_id = :playerId) AND f.status = 'ACCEPTED' AND p.status = 'active'
      `, { replacements: { playerId }, type: QueryTypes.SELECT }),
      sequelize.query(`
        SELECT f.friendship_id AS "friendshipId", f.created_at AS "sentAt", p.player_id AS "playerId", p.username,
               (f.addressee_id = :playerId) AS incoming
        FROM friendships f
        JOIN players p ON p.player_id = CASE WHEN f.requester_id = :playerId THEN f.addressee_id ELSE f.requester_id END
        WHERE f.status = 'PENDING' AND (f.requester_id = :playerId OR f.addressee_id = :playerId) AND p.status = 'active'
        ORDER BY f.created_at DESC
      `, { replacements: { playerId }, type: QueryTypes.SELECT }),
      onlinePlayerIds()
    ])

    const shaped = friends.map(({ tableCode, tableVariant, tableMode, tableSeated, tableMaxSeats, ...friend }) => {
      const isOnline = online.has(friend.playerId)
      return {
        ...friend,
        online: isOnline,
        table: isOnline && tableCode
          ? { code: tableCode, variant: tableVariant, mode: tableMode, seated: tableSeated, maxSeats: tableMaxSeats, hasRoom: tableSeated < tableMaxSeats }
          : null
      }
    }).sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username))

    return {
      friends: shaped,
      incoming: requests.filter(request => request.incoming).map(({ incoming, ...request }) => request),
      outgoing: requests.filter(request => !request.incoming).map(({ incoming, ...request }) => request),
      message: SUCCESS_MSG.GET_SUCCESS
    }
  }
}
