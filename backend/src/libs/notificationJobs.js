import models, { sequelize } from '~/db/models'
import Logger from '~/libs/logger'
import redisClient from '~/libs/redisClient'
import { SendDailyRemindersService } from '~/services/notification'
import { DAILY_REMINDER_INTERVAL_MS, DAILY_REMINDER_LOCK } from '~/utils/constants/notification.constants'
import { randomUUID } from 'crypto'

/**
 * Background work for notifications. Every server runs the timer; the Redis
 * lock lets one of them do each pass.
 */
class NotificationJobs {
  #timer = null
  #nodeId = randomUUID()

  start () {
    this.#timer = setInterval(() => { this.#dailyReminders() }, DAILY_REMINDER_INTERVAL_MS)
    this.#timer.unref?.()
  }

  stop () {
    clearInterval(this.#timer)
  }

  async #dailyReminders () {
    try {
      const locked = await redisClient.client.set(DAILY_REMINDER_LOCK, this.#nodeId, 'PX', DAILY_REMINDER_INTERVAL_MS - 1000, 'NX')
      if (!locked) return
      const done = await SendDailyRemindersService.execute({}, { dbModels: models, sequelize, logger: Logger })
      if (!done.successful) Logger.error('NotificationJobs', { message: 'Daily reminders failed', fault: done.errors })
      else if (done.result.reminded) Logger.info('NotificationJobs', { message: `Sent ${done.result.reminded} daily reminders` })
    } catch (exception) {
      Logger.error('NotificationJobs', { message: 'Daily reminders crashed', exception })
    }
  }
}

export default new NotificationJobs()
