import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { ClaimBonusService } from '~/services/bonus'
import { BONUS_CODES } from '~/utils/constants/bonus.constants'
import { USERNAME_PATTERN } from '~/utils/constants/player.constants'
import { sameIgnoringCase, toProfile, toWalletView } from '~/utils/player.utils'
import { inTransaction, withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    username: { type: 'string', pattern: USERNAME_PATTERN },
    isGuest: { type: 'boolean' }
  },
  required: ['username', 'isGuest']
})

/**
 * Internal: creates a player with an empty wallet and grants the signup
 * bonus, all in one transaction. Used by guest login and the first Google or
 * Apple sign-in.
 */
export class CreatePlayerService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { username, isGuest } = this.args
    const { dbModels: { Bonus, Player, Wallet } } = this.context

    return withTransaction(this, async (transaction) => {
      if (await Player.findOne({ where: sameIgnoringCase('username', username), transaction })) {
        return this.addError('UsernameTakenErrorType', `"${username}"`)
      }

      let player
      try {
        player = await Player.create({ username, isGuest, lastLoginAt: new Date() }, { transaction })
      } catch (error) {
        // Lost a race with another new player for the same name.
        if (error.name !== 'SequelizeUniqueConstraintError') throw error
        return this.addError('UsernameTakenErrorType', `"${username}"`)
      }
      let wallet = await Wallet.create({ playerId: player.playerId }, { transaction })

      const signupBonus = await Bonus.findOne({ where: { code: BONUS_CODES.SIGNUP, isActive: true }, transaction })
      if (signupBonus) {
        const claimed = await ClaimBonusService.execute(
          { playerId: player.playerId, code: signupBonus.code, automatic: true },
          inTransaction(this.context, transaction)
        )
        if (!claimed.successful) return this.mergeErrors(claimed.errors)
        wallet = claimed.result.wallet
      }

      return { player: toProfile(player), wallet: toWalletView(wallet), tokenVersion: player.tokenVersion }
    })
  }
}
