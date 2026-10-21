// What a push notification can be about. Players switch these on and off.
export const NOTIFICATION_CATEGORIES = {
  DAILY_BONUS: 'dailyBonus',
  FRIENDS: 'friends',
  ACHIEVEMENTS: 'achievements',
  REFERRALS: 'referrals',
  // News from the team, sent by an admin.
  ANNOUNCEMENTS: 'announcements'
}

export const NOTIFICATION_CATEGORY_LIST = Object.values(NOTIFICATION_CATEGORIES)

export const PUSH_PLATFORMS = ['android', 'ios']
export const PUSH_LANGUAGES = ['en', 'hi', 'es', 'fr']

// A player has at most this many phones registered; the least recently seen one is dropped.
export const MAX_PUSH_TOKENS_PER_PLAYER = 5

// The daily reminder goes out when the bonus is ready, and only for this long after:
// a reminder two days late is noise. It is looked for this often.
export const DAILY_REMINDER_WINDOW_MS = 6 * 60 * 60 * 1000
export const DAILY_REMINDER_INTERVAL_MS = 10 * 60 * 1000
export const DAILY_REMINDER_LOCK = 'roulette:dailyReminders'
// Reminders at night are unkind: nothing is sent between these local hours, if the phone's timezone is known.
export const QUIET_HOURS = { from: 22, to: 8 }

// What an admin can send. Lock screens cut long text, so the limits are short.
export const ANNOUNCEMENT_AUDIENCES = { ALL: 'ALL', INACTIVE: 'INACTIVE', PLAYER: 'PLAYER' }
export const ANNOUNCEMENT_LIMITS = { title: 65, body: 178, inactiveDays: { min: 1, max: 365 } }
// Broadcasts (not a test to one player) are limited per day, so a slip can't flood everyone.
export const ANNOUNCEMENT_BROADCASTS_PER_DAY = 5
export const ANNOUNCEMENT_BATCH = 100
// How many players are sent to at once.
export const ANNOUNCEMENT_CONCURRENCY = 10
