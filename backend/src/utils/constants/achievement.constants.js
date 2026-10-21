// What a player can earn, and what it takes. Words for each (title, description) live in the
// apps, by code, so they can be translated; this is only the rules and the reward in chips.
//
// `group` says which events can change the answer, so a settled round only re-checks the
// play groups. `metric` is a number worked out for the player (see achievement.utils.js).
export const ACHIEVEMENT_GROUPS = {
  PLAY: 'play',
  HOSTED: 'hosted',
  FRIENDS: 'friends',
  REFERRALS: 'referrals',
  DAILY: 'daily'
}

export const ACHIEVEMENTS = [
  // Playing
  { code: 'FIRST_SPIN', group: 'play', metric: 'rounds', target: 1, reward: 50 },
  { code: 'REGULAR', group: 'play', metric: 'rounds', target: 25, reward: 100 },
  { code: 'DEDICATED', group: 'play', metric: 'rounds', target: 100, reward: 250 },
  { code: 'VETERAN', group: 'play', metric: 'rounds', target: 500, reward: 1000 },
  // Winning
  { code: 'FIRST_WIN', group: 'play', metric: 'roundsWon', target: 1, reward: 50 },
  { code: 'HOT_STREAK', group: 'play', metric: 'winStreak', target: 3, reward: 150 },
  { code: 'ON_FIRE', group: 'play', metric: 'winStreak', target: 5, reward: 500 },
  { code: 'BIG_WIN', group: 'play', metric: 'bigWin', target: 500, reward: 200 },
  { code: 'HIGH_ROLLER', group: 'play', metric: 'bigWin', target: 2500, reward: 500 },
  { code: 'STRAIGHT_UP', group: 'play', metric: 'straightWins', target: 1, reward: 200 },
  { code: 'ZERO_HERO', group: 'play', metric: 'zeroWins', target: 1, reward: 300 },
  // Trying things
  { code: 'EXPLORER', group: 'play', metric: 'betTypes', target: 5, reward: 100 },
  { code: 'STRATEGIST', group: 'play', metric: 'betTypes', target: 10, reward: 250 },
  { code: 'BOTH_WHEELS', group: 'play', metric: 'variants', target: 2, reward: 100 },
  // With others
  { code: 'FIRST_FRIEND', group: 'friends', metric: 'friends', target: 1, reward: 100 },
  { code: 'SOCIALITE', group: 'friends', metric: 'friends', target: 5, reward: 250 },
  { code: 'HOST', group: 'hosted', metric: 'hostedWithFriend', target: 1, reward: 150 },
  { code: 'RECRUITER', group: 'referrals', metric: 'referralsRewarded', target: 1, reward: 250 },
  // Coming back
  { code: 'DAILY_WEEK', group: 'daily', metric: 'dailyStreak', target: 7, reward: 300 }
]

export const ACHIEVEMENT_CODES = ACHIEVEMENTS.map(achievement => achievement.code)

// The win streak counts the player's most recent rounds, so this many are looked at.
export const STREAK_LOOKBACK = 10
