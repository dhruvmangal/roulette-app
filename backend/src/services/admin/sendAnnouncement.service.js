import { Op } from 'sequelize'
import ajv from '~/libs/ajv'
import { getApnsClient } from '~/libs/apns'
import { getFcmClient } from '~/libs/fcm'
import ServiceBase from '~/services/serviceBase'
import { SendPushService } from '~/services/notification'
import { audienceReach, audiencePlayerIds } from '~/utils/announcement.utils'
import { recordAudit } from '~/utils/admin.utils'
import { ADMIN_ACTIONS, ADMIN_TARGETS } from '~/utils/constants/admin.constants'
import {
  ANNOUNCEMENT_AUDIENCES, ANNOUNCEMENT_BATCH, ANNOUNCEMENT_BROADCASTS_PER_DAY, ANNOUNCEMENT_CONCURRENCY, ANNOUNCEMENT_LIMITS, NOTIFICATION_CATEGORIES
} from '~/utils/constants/notification.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: ANNOUNCEMENT_LIMITS.title },
    body: { type: 'string', minLength: 1, maxLength: ANNOUNCEMENT_LIMITS.body },
    audience: { enum: Object.values(ANNOUNCEMENT_AUDIENCES) },
    days: { type: ['integer', 'null'], minimum: ANNOUNCEMENT_LIMITS.inactiveDays.min, maximum: ANNOUNCEMENT_LIMITS.inactiveDays.max },
    playerId: { type: ['integer', 'null'], minimum: 1 },
    // Made by the admin app for each form, so a double-click sends once.
    requestId: { type: 'string', minLength: 8, maxLength: 64 }
  },
  required: ['title', 'body', 'audience', 'requestId']
})

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Sends a push notification from the admin app, to everyone, to players who
 * have been away, or to one player (a test).
 *
 * To one player it sends at once and says how it went. To a group it records
 * the announcement, answers, and sends in the background in batches; each
 * player's push has its own key, so a retry can never send the same one twice.
 */
export class SendAnnouncementService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { title, body, audience, requestId } = this.args
    const days = this.args.days ?? null
    const playerId = this.args.playerId ?? null
    const { admin, sequelize, dbModels: { Announcement } } = this.context

    if (audience === ANNOUNCEMENT_AUDIENCES.INACTIVE && !days) return this.addError('RequestInputValidationErrorType', 'days is needed for this audience')
    if (audience === ANNOUNCEMENT_AUDIENCES.PLAYER && !playerId) return this.addError('RequestInputValidationErrorType', 'playerId is needed for this audience')
    if (!getFcmClient() && !getApnsClient()) return this.addError('PushNotConfiguredErrorType', '')

    // The same form submitted twice is one announcement.
    const earlier = await Announcement.findOne({ where: { requestId } })
    if (earlier) return { announcement: earlier.get({ plain: true }), replayed: true, message: SUCCESS_MSG.CREATE_SUCCESS }

    const single = audience === ANNOUNCEMENT_AUDIENCES.PLAYER
    if (!single) {
      const today = await Announcement.count({
        where: { createdAt: { [Op.gt]: new Date(Date.now() - DAY_MS) }, audience: { [Op.ne]: ANNOUNCEMENT_AUDIENCES.PLAYER } }
      })
      if (today >= ANNOUNCEMENT_BROADCASTS_PER_DAY) return this.addError('AnnouncementLimitReachedErrorType', `(${ANNOUNCEMENT_BROADCASTS_PER_DAY} a day)`)
    }

    const { players } = await audienceReach(sequelize, { audience, days, playerId })
    // A test to one player is allowed to find nobody: it says why instead of failing.
    if (!players && !single) return this.addError('AnnouncementNoRecipientsErrorType', '')

    const announcement = await withTransaction(this, async (transaction) => {
      const created = await Announcement.create({
        adminUserId: admin.adminUserId, requestId, title, body, audience, audienceDays: days, audiencePlayerId: playerId, targeted: players
      }, { transaction })
      await recordAudit(this.context, transaction, {
        action: ADMIN_ACTIONS.ANNOUNCEMENT_SEND,
        targetType: ADMIN_TARGETS.ANNOUNCEMENT,
        targetId: created.announcementId,
        details: { title, audience, days, playerId, targeted: players }
      })
      return created
    })
    if (!announcement) return

    const target = { audience, days, playerId }
    if (single) {
      await this.#deliver(announcement, target)
      return { announcement: announcement.get({ plain: true }), message: SUCCESS_MSG.CREATE_SUCCESS }
    }

    // Answer now; the sending carries on after the response.
    setImmediate(() => { this.#deliver(announcement, target).catch(() => {}) })
    return { announcement: announcement.get({ plain: true }), message: SUCCESS_MSG.CREATE_SUCCESS }
  }

  /** Sends to every player in the audience in batches, then records the totals. Never throws. */
  async #deliver (announcement, target) {
    const { sequelize } = this.context
    const { announcementId, title, body } = announcement
    let sent = 0
    const skipped = {}
    try {
      let afterId = 0
      for (;;) {
        const ids = await audiencePlayerIds(sequelize, target, afterId, ANNOUNCEMENT_BATCH)
        if (!ids.length) break
        afterId = ids[ids.length - 1]
        // A few at a time: fast enough, and kind to Google and Apple.
        for (let i = 0; i < ids.length; i += ANNOUNCEMENT_CONCURRENCY) {
          const results = await Promise.all(ids.slice(i, i + ANNOUNCEMENT_CONCURRENCY).map(playerId => SendPushService.execute({
            playerId,
            category: NOTIFICATION_CATEGORIES.ANNOUNCEMENTS,
            custom: { title, body },
            data: { screen: 'home' },
            dedupeKey: `announcement:${announcementId}:${playerId}`
          }, this.context)))
          for (const result of results) {
            if (!result.successful) skipped.error = (skipped.error ?? 0) + 1
            else if (result.result.sent > 0) sent += result.result.sent
            else skipped[result.result.skipped ?? 'unreachable'] = (skipped[result.result.skipped ?? 'unreachable'] ?? 0) + 1
          }
        }
        // Keep the totals current while a long send runs.
        await announcement.update({ sent, skipped })
      }
      await announcement.update({ status: 'SENT', sent, skipped, finishedAt: new Date() })
    } catch (exception) {
      this.log.error('An announcement failed part-way', { announcementId, exception })
      await announcement.update({ status: 'FAILED', sent, skipped, error: String(exception?.message ?? exception).slice(0, 500), finishedAt: new Date() }).catch(() => {})
    }
  }
}
