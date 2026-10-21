import { QueryTypes } from 'sequelize'
import { REFERRAL_CODE_ALPHABET, REFERRAL_CODE_LENGTH } from '~/utils/constants/referral.constants'

/** A fresh referral code like 'K7QM2XA' (no 0/O or 1/I/L, so it reads aloud cleanly). */
export const newReferralCode = (randomInt) =>
  Array.from({ length: REFERRAL_CODE_LENGTH }, () => REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)]).join('')

/** Codes are shown upper-case; accept them typed any way, with stray spaces or dashes. */
export const normalizeReferralCode = (code) => String(code).toUpperCase().replace(/[\s-]/g, '')

/** Settled online rounds each player had chips on: { [playerId]: rounds }. */
export const roundsPlayedBy = async (sequelize, playerIds, transaction) => {
  if (!playerIds.length) return {}
  const rows = await sequelize.query(`
    SELECT player_id AS "playerId", count(DISTINCT round_id)::int AS rounds
    FROM bets WHERE player_id IN (:playerIds) AND status IN ('WON', 'LOST')
    GROUP BY player_id
  `, { replacements: { playerIds }, type: QueryTypes.SELECT, transaction })
  return Object.fromEntries(rows.map(row => [row.playerId, row.rounds]))
}

/** Whether two players have ever played on the same device (the app's install id). */
export const shareADevice = async (sequelize, playerId, otherPlayerId, transaction) => {
  const [row] = await sequelize.query(`
    SELECT EXISTS (
      SELECT 1 FROM player_devices a JOIN player_devices b ON a.device_id = b.device_id
      WHERE a.player_id = :playerId AND b.player_id = :otherPlayerId
    ) AS shared
  `, { replacements: { playerId, otherPlayerId }, type: QueryTypes.SELECT, transaction })
  return row.shared
}
