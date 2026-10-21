import { randomInt } from 'crypto'
import { Sequelize } from 'sequelize'
import { PLAYER_STATUS } from '~/utils/constants/player.constants'

/** What a player may see about their account, including which providers are linked. */
export const toProfile = (player, identities = []) => ({
  playerId: player.playerId,
  username: player.username,
  email: identities.find(identity => identity.email)?.email ?? null,
  providers: identities.map(identity => identity.provider),
  isGuest: player.isGuest,
  status: player.status,
  avatar: player.avatar ?? null,
  country: player.country ?? null,
  lastLoginAt: player.lastLoginAt ?? null,
  createdAt: player.createdAt
})

export const toWalletView = (wallet) => ({
  walletId: wallet.walletId,
  balance: wallet.balance,
  lockedBalance: wallet.lockedBalance,
  currency: wallet.currency,
  version: wallet.version
})

/** Matches a column against a value ignoring case, as the unique lower() indexes do. */
export const sameIgnoringCase = (column, value) =>
  Sequelize.where(Sequelize.fn('lower', Sequelize.col(column)), value.toLowerCase())

/** The error type to raise for an account that may not sign in, or null. */
export const statusErrorType = (player) => {
  if (player.status === PLAYER_STATUS.BANNED) return 'PlayerBannedErrorType'
  if (player.status !== PLAYER_STATUS.ACTIVE) return 'PlayerInactiveErrorType'
  return null
}

const SUFFIX_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/**
 * A username for a new Google or Apple player, from their name or email,
 * e.g. "Ana López" → "ana_lopez_k3m9". Players can be renamed later.
 */
export const usernameFrom = ({ name, email }) => {
  const source = name || email?.split('@')[0] || ''
  const base = source.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 14)
  const suffix = Array.from({ length: 4 }, () => SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)]).join('')
  return `${base.length >= 3 ? base : 'player'}_${suffix}`
}
