import { randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'
import ServiceBase from '~/services/serviceBase'
import { hashTokenId, newTokenId, signAccessToken, signRefreshToken } from '~/utils/auth.utils'
import { TOKEN_TYPES } from '~/utils/constants/player.constants'
import { withTransaction } from '~/utils/transaction.utils'

/**
 * Internal: issues a token pair and records the refresh token. A new login
 * starts a new family; a refresh continues its family.
 */
export class StartSessionService extends ServiceBase {
  async run () {
    const { playerId, tokenVersion, familyId = randomUUID() } = this.args
    const { dbModels: { PlayerSession } } = this.context

    return withTransaction(this, async (transaction) => {
      const tokenId = newTokenId()
      const refreshToken = signRefreshToken({ playerId, tokenVersion, type: TOKEN_TYPES.REFRESH, sid: tokenId })
      const session = await PlayerSession.create({
        playerId,
        familyId,
        tokenHash: hashTokenId(tokenId),
        expiresAt: new Date(jwt.decode(refreshToken).exp * 1000)
      }, { transaction })

      return {
        session,
        tokens: { accessToken: signAccessToken({ playerId, tokenVersion, type: TOKEN_TYPES.ACCESS }), refreshToken }
      }
    })
  }
}
