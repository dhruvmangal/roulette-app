import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { GUEST_USERNAME_PREFIX, IDENTITY_PROVIDERS } from '~/utils/constants/player.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { QualifyReferralsService } from '~/services/referral'
import { identityVerifier } from '~/utils/identityToken.utils'
import { sameIgnoringCase, toProfile, usernameFrom } from '~/utils/player.utils'
import { withTransaction } from '~/utils/transaction.utils'
import { providerTokenSchema } from './signInWithProvider.service'

const constraints = ajv.compile({
  ...providerTokenSchema,
  properties: {
    ...providerTokenSchema.properties,
    provider: { enum: Object.values(IDENTITY_PROVIDERS) },
    playerId: { type: 'integer', minimum: 1 }
  },
  required: [...providerTokenSchema.required, 'provider', 'playerId']
})

/**
 * Links a Google or Apple account to the signed-in player. For a guest this
 * saves the account: same player, same chips, and they can now sign in on
 * any device. A guest name is swapped for one from the account.
 */
export class LinkProviderService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, provider, idToken, nonce, name } = this.args
    const { dbModels: { Player, PlayerIdentity } } = this.context

    const verify = identityVerifier(provider)
    if (!verify) return this.addError('ProviderNotConfiguredErrorType', provider)
    const checked = await verify(idToken, { nonce })
    if (!checked.ok) return this.addError('InvalidIdentityTokenErrorType', `(${checked.reason})`)
    const { subject, email } = checked.identity

    const linked = await withTransaction(this, async (transaction) => {
      const player = await Player.findByPk(playerId, { lock: transaction.LOCK.UPDATE, transaction })
      if (!player) return this.addError('UserNotExistsErrorType', '')

      const owner = await PlayerIdentity.findOne({ where: { provider, subject }, transaction })
      if (owner && owner.playerId !== playerId) return this.addError('IdentityInUseErrorType', '')
      if (!owner) {
        const linked = await PlayerIdentity.findOne({ where: { playerId, provider }, transaction })
        if (linked) return this.addError('IdentityInUseErrorType', `(a different ${provider} account is already linked)`)
        await PlayerIdentity.create({ playerId, provider, subject, email, lastUsedAt: new Date() }, { transaction })
      }

      if (player.isGuest) {
        const changes = { isGuest: false }
        if (player.username.startsWith(GUEST_USERNAME_PREFIX)) {
          const username = usernameFrom({ name: name || checked.identity.name, email })
          if (!await Player.findOne({ where: sameIgnoringCase('username', username), transaction })) changes.username = username
        }
        await player.update(changes, { transaction })
      }

      const identities = await PlayerIdentity.findAll({ where: { playerId }, order: [['playerIdentityId', 'ASC']], transaction })
      return { player: toProfile(player, identities), message: SUCCESS_MSG.PROVIDER_LINKED }
    })
    if (!linked) return

    // Saving the account may be the last step a referred friend needed.
    try {
      const referrals = await QualifyReferralsService.execute({ playerIds: [playerId] }, this.context)
      if (!referrals.successful) this.log.error('Referral check failed', { playerId, fault: referrals.errors })
    } catch (exception) {
      this.log.error('Referral check failed', { playerId, exception })
    }
    return linked
  }
}
