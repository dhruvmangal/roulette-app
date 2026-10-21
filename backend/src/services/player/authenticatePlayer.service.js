import ServiceBase from '~/services/serviceBase'
import { TOKEN_TYPES } from '~/utils/constants/player.constants'
import { statusErrorType } from '~/utils/player.utils'

/**
 * Turns the claims of an already-verified access token into the signed-in
 * player, rejecting revoked tokens and accounts that may not play. Shared by
 * the REST (passport) and socket auth middlewares.
 */
export class AuthenticatePlayerService extends ServiceBase {
  async run () {
    const { claims } = this.args
    const { dbModels: { Player } } = this.context

    if (claims?.type !== TOKEN_TYPES.ACCESS || !Number.isInteger(claims.playerId)) return this.addError('InvalidTokenErrorType', '')

    const player = await Player.findByPk(claims.playerId)
    if (!player || player.tokenVersion !== claims.tokenVersion) return this.addError('InvalidTokenErrorType', '')
    const blocked = statusErrorType(player)
    if (blocked) return this.addError(blocked, '')

    return { player: { playerId: player.playerId, username: player.username, isGuest: player.isGuest } }
  }
}
