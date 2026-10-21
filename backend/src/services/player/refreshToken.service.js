import { Op } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { hashTokenId, verifyRefreshToken } from '~/utils/auth.utils'
import { TOKEN_TYPES } from '~/utils/constants/player.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { statusErrorType, toProfile } from '~/utils/player.utils'
import { inTransaction, withTransaction } from '~/utils/transaction.utils'
import { StartSessionService } from './startSession.service'

// Two tabs refreshing with the same token a moment apart is a race, not a theft.
const REUSE_GRACE_MS = 10000

const constraints = ajv.compile({
  type: 'object',
  properties: { refreshToken: { type: 'string', minLength: 1, maxLength: 2048 } },
  required: ['refreshToken']
})

/**
 * Trades a refresh token for a new pair, retiring the old one (rotation).
 *
 * A retired token presented again means someone else has a copy: the whole
 * family is revoked, so both the thief and the player must sign in again.
 */
export class RefreshTokenService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { refreshToken } = this.args
    const { dbModels: { Player, PlayerIdentity, PlayerSession } } = this.context

    let claims
    try {
      claims = verifyRefreshToken(refreshToken)
    } catch {
      return this.addError('InvalidRefreshTokenErrorType', '')
    }
    if (claims.type !== TOKEN_TYPES.REFRESH || !claims.sid) return this.addError('InvalidRefreshTokenErrorType', '')

    // Runs to completion even when the token is refused, so a detected theft
    // stays revoked; the refusal is reported afterwards.
    const outcome = await withTransaction(this, async (transaction) => {
      const session = await PlayerSession.findOne({ where: { tokenHash: hashTokenId(claims.sid) }, lock: transaction.LOCK.UPDATE, transaction })
      if (!session || session.playerId !== claims.playerId) return { refused: true }

      const now = new Date()
      if (session.revokedAt) {
        const justRotated = session.replacedBySessionId && now - session.revokedAt < REUSE_GRACE_MS
        if (justRotated) return { refused: true }
        await PlayerSession.update({ revokedAt: now }, { where: { familyId: session.familyId, revokedAt: { [Op.is]: null } }, transaction })
        this.log.info('Refresh token reused; family revoked', { context: { playerId: session.playerId, familyId: session.familyId } })
        return { refused: true }
      }
      if (session.expiresAt <= now) return { refused: true }

      const player = await Player.findByPk(claims.playerId, { transaction })
      if (!player || player.tokenVersion !== claims.tokenVersion) return { refused: true }
      const blocked = statusErrorType(player)
      if (blocked) return { blocked }

      const next = await StartSessionService.execute(
        { playerId: player.playerId, tokenVersion: player.tokenVersion, familyId: session.familyId },
        inTransaction(this.context, transaction)
      )
      if (!next.successful) return { errors: next.errors }
      await session.update({ revokedAt: now, replacedBySessionId: next.result.session.playerSessionId }, { transaction })
      await player.update({ lastLoginAt: now }, { transaction })
      return { player, tokens: next.result.tokens }
    })

    if (outcome.errors) return this.mergeErrors(outcome.errors)
    if (outcome.blocked) return this.addError(outcome.blocked, '')
    if (outcome.refused) return this.addError('InvalidRefreshTokenErrorType', '')
    const identities = await PlayerIdentity.findAll({ where: { playerId: outcome.player.playerId }, order: [['playerIdentityId', 'ASC']] })
    return { player: toProfile(outcome.player, identities), tokens: outcome.tokens, message: SUCCESS_MSG.TOKEN_REFRESHED }
  }
}
