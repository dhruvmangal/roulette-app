import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { IDENTITY_PROVIDERS } from '~/utils/constants/player.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { identityVerifier } from '~/utils/identityToken.utils'
import { statusErrorType, toProfile, toWalletView, usernameFrom } from '~/utils/player.utils'
import { inTransaction, withTransaction } from '~/utils/transaction.utils'
import { CreatePlayerService } from './createPlayer.service'
import { StartSessionService } from './startSession.service'

const USERNAME_ATTEMPTS = 3

export const providerTokenSchema = {
  type: 'object',
  properties: {
    idToken: { type: 'string', minLength: 20, maxLength: 8192 },
    // The raw nonce the app sent to the provider (Apple is sent its SHA-256).
    nonce: { type: 'string', minLength: 8, maxLength: 256 },
    // Apple only sends the player's name to the app, once, at first sign-in.
    name: { type: 'string', maxLength: 64 }
  },
  required: ['idToken']
}

const constraints = ajv.compile({
  ...providerTokenSchema,
  properties: { ...providerTokenSchema.properties, provider: { enum: Object.values(IDENTITY_PROVIDERS) } },
  required: [...providerTokenSchema.required, 'provider']
})

/**
 * Signs in with a Google or Apple ID token. The first time an account is seen
 * a player is created for it (with the signup bonus); after that it signs in
 * as the same player.
 */
export class SignInWithProviderService extends ServiceBase {
  get constraints () {
    return constraints
  }

  /** Which provider's account this signs in. */
  get provider () {
    return this.args.provider
  }

  /** Who the provider says this is, or null once an error has been added. A subclass can verify differently. */
  async verifyIdentity () {
    const { provider } = this
    const { idToken, nonce } = this.args
    const verify = identityVerifier(provider)
    if (!verify) return this.addError('ProviderNotConfiguredErrorType', provider)
    const checked = await verify(idToken, { nonce })
    if (!checked.ok) return this.addError('InvalidIdentityTokenErrorType', `(${checked.reason})`)
    return checked
  }

  async run () {
    const { provider } = this
    const { name } = this.args
    const { dbModels: { Player, PlayerIdentity, Wallet } } = this.context

    const checked = await this.verifyIdentity()
    if (!checked) return
    const { subject, email } = checked.identity

    return withTransaction(this, async (transaction) => {
      const now = new Date()
      let identity = await PlayerIdentity.findOne({ where: { provider, subject }, lock: transaction.LOCK.UPDATE, transaction })
      let player
      let isNew = false

      if (identity) {
        player = await Player.findByPk(identity.playerId, { transaction })
        const blocked = statusErrorType(player)
        if (blocked) return this.addError(blocked, '')
        await identity.update({ lastUsedAt: now, ...(email && { email }) }, { transaction })
        await player.update({ lastLoginAt: now }, { transaction })
      } else {
        for (let attempt = 1; !player; attempt++) {
          const created = await CreatePlayerService.execute(
            { username: usernameFrom({ name: name || checked.identity.name, email }), isGuest: false },
            inTransaction(this.context, transaction)
          )
          if (created.successful) {
            player = await Player.findByPk(created.result.player.playerId, { transaction })
          } else if (!('UsernameTakenErrorType' in (created.errors.CreatePlayerService || {})) || attempt === USERNAME_ATTEMPTS) {
            return this.mergeErrors(created.errors)
          }
        }
        identity = await PlayerIdentity.create({ playerId: player.playerId, provider, subject, email, lastUsedAt: now }, { transaction })
        isNew = true
      }

      const session = await StartSessionService.execute(
        { playerId: player.playerId, tokenVersion: player.tokenVersion },
        inTransaction(this.context, transaction)
      )
      if (!session.successful) return this.mergeErrors(session.errors)

      const [identities, wallet] = await Promise.all([
        PlayerIdentity.findAll({ where: { playerId: player.playerId }, order: [['playerIdentityId', 'ASC']], transaction }),
        Wallet.findOne({ where: { playerId: player.playerId }, transaction })
      ])
      return {
        player: toProfile(player, identities),
        wallet: toWalletView(wallet),
        tokens: session.result.tokens,
        isNew,
        message: isNew ? SUCCESS_MSG.SIGN_UP_SUCCESS : SUCCESS_MSG.LOGIN_SUCCESS
      }
    })
  }
}
