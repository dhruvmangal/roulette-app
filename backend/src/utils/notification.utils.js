import { NOTIFICATION_CATEGORY_LIST } from '~/utils/constants/notification.constants'

/** Every category with its on/off state: one the player never set is on. */
export const effectivePrefs = (stored) => Object.fromEntries(NOTIFICATION_CATEGORY_LIST.map(name => [name, stored?.[name] !== false]))

/** The hour (0-23) it is in a timezone, or null if the timezone is unknown to this server. */
export const localHour = (timeZone, at = new Date()) => {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(at)
    return Number(hour)
  } catch {
    return null
  }
}

/** Whether an hour falls in the quiet window, which may wrap past midnight (22 to 8). */
export const inQuietHours = (hour, { from, to }) => hour !== null && (from > to ? hour >= from || hour < to : hour >= from && hour < to)
