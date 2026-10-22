export const ADMIN_STATUS = {
  ACTIVE: 'active',
  DISABLED: 'disabled'
}

export const ADMIN_TOKEN_TYPE = 'admin'

export const ADMIN_ACTIONS = {
  WALLET_ADJUST: 'WALLET_ADJUST',
  PLAYER_STATUS: 'PLAYER_STATUS',
  PLAYER_LOGOUT: 'PLAYER_LOGOUT',
  BONUS_UPDATE: 'BONUS_UPDATE',
  ANNOUNCEMENT_SEND: 'ANNOUNCEMENT_SEND',
  SETTINGS_UPDATE: 'SETTINGS_UPDATE'
}

export const ADMIN_TARGETS = {
  PLAYER: 'PLAYER',
  BONUS: 'BONUS',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
  SETTING: 'SETTING'
}

// Sort keys the player list accepts, mapped to SQL; never interpolate user input.
export const PLAYER_SORTS = {
  newest: 'p.created_at DESC',
  oldest: 'p.created_at ASC',
  lastLogin: 'p.last_login_at DESC NULLS LAST',
  balanceHigh: 'w.balance DESC NULLS LAST',
  balanceLow: 'w.balance ASC NULLS LAST',
  username: 'lower(p.username) ASC'
}
