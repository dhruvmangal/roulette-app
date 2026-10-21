import { QueryTypes } from 'sequelize'
import ajv from '~/libs/ajv'
import { isOnline } from '~/libs/presence'
import ServiceBase from '~/services/serviceBase'
import { bonusAvailability } from '~/utils/bonus.utils'
import { BONUS_CODES } from '~/utils/constants/bonus.constants'
import { DAILY_REMINDER_WINDOW_MS, NOTIFICATION_CATEGORIES, QUIET_HOURS } from '~/utils/constants/notification.constants'
import { inQuietHours, localHour } from '~/utils/notification.utils'
import { PUSH_TYPES } from '~/utils/pushMessages.utils'
import { SendPushService } from './sendPush.service'

const constraints = ajv.compile({ type: 'object', properties: { now: {} } })
const BATCH = 500

/**
 * Internal job: tells players with a phone set up that their daily chips are
 * ready. Only for players who have claimed before (a reminder to someone who
 * never has is a nag), only in the hours after the bonus becomes ready, only
 * once per claim, and not at night where they are.
 */
export class SendDailyRemindersService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const now = this.args.now ? new Date(this.args.now) : new Date()
    const { dbModels: { Bonus }, sequelize } = this.context

    const bonus = await Bonus.findOne({ where: { code: BONUS_CODES.DAILY, isActive: true } })
    if (!bonus?.cooldownSeconds) return { reminded: 0 }

    const due = await sequelize.query(`
      SELECT * FROM (
        SELECT DISTINCT ON (pb.player_id)
               pb.player_id AS "playerId", pb.claim_number AS "claimNumber", pb.claimed_at AS "claimedAt", pb.streak_day AS "streakDay",
               (SELECT d.timezone FROM player_devices d WHERE d.player_id = pb.player_id ORDER BY d.last_seen_at DESC LIMIT 1) AS timezone
        FROM player_bonuses pb
        JOIN players p ON p.player_id = pb.player_id AND p.status = 'active'
        WHERE pb.bonus_id = :bonusId AND EXISTS (SELECT 1 FROM push_tokens t WHERE t.player_id = pb.player_id)
        ORDER BY pb.player_id, pb.claim_number DESC
      ) latest
      WHERE latest."claimedAt" + (:cooldown * interval '1 second') <= :now
        AND latest."claimedAt" + ((:cooldown + :window) * interval '1 second') > :now
      LIMIT :batch
    `, {
      replacements: { bonusId: bonus.bonusId, cooldown: bonus.cooldownSeconds, window: DAILY_REMINDER_WINDOW_MS / 1000, now, batch: BATCH },
      type: QueryTypes.SELECT
    })

    let reminded = 0
    for (const row of due) {
      const availability = bonusAvailability(bonus, { lastClaim: { ...row, claimedAt: new Date(row.claimedAt) }, balance: 0 }, now)
      if (!availability.claimable) continue
      if (row.timezone && inQuietHours(localHour(row.timezone, now), QUIET_HOURS)) continue
      // In the game already: the Bonuses screen shows it.
      if (await isOnline(row.playerId)) continue

      const pushed = await SendPushService.execute({
        playerId: row.playerId,
        category: NOTIFICATION_CATEGORIES.DAILY_BONUS,
        type: PUSH_TYPES.dailyReady,
        vars: { amount: availability.amount.toLocaleString('en-US') },
        data: { screen: 'bonuses' },
        dedupeKey: `daily:${row.playerId}:${row.claimNumber}`
      }, this.context)
      if (pushed.successful && pushed.result.sent > 0) reminded++
    }
    return { reminded, checked: due.length }
  }
}
