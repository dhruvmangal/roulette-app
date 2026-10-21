import config from '~/configs/app.config'
import ajv from '~/libs/ajv'
import { IDENTITY_PROVIDERS } from '~/utils/constants/player.constants'
import { SignInWithProviderService } from './signInWithProvider.service'

const DISCORD_API = 'https://discord.com/api'

const constraints = ajv.compile({
  type: 'object',
  properties: { code: { type: 'string', minLength: 10, maxLength: 512 } },
  required: ['code']
})

/**
 * Signs in a player who opened the game as a Discord Activity. The Activity's
 * login gives the app a one-time code; it is exchanged here, with the app's
 * secret, for the Discord account it belongs to. After that it is the same as
 * signing in with Google or Apple: the first time creates a player, later
 * times sign in as the same one.
 */
export class SignInWithDiscordService extends SignInWithProviderService {
  get constraints () {
    return constraints
  }

  get provider () {
    return IDENTITY_PROVIDERS.DISCORD
  }

  async verifyIdentity () {
    const clientId = config.get('auth.discordClientId')
    const clientSecret = config.get('auth.discordClientSecret')
    if (!clientId || !clientSecret) return this.addError('ProviderNotConfiguredErrorType', IDENTITY_PROVIDERS.DISCORD)

    try {
      const exchanged = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code: this.args.code })
      })
      if (!exchanged.ok) return this.addError('InvalidIdentityTokenErrorType', '(Discord refused the login code)')
      const { access_token: accessToken } = await exchanged.json()

      const me = await fetch(`${DISCORD_API}/users/@me`, { headers: { authorization: `Bearer ${accessToken}` } })
      if (!me.ok) return this.addError('InvalidIdentityTokenErrorType', '(Discord did not return the account)')
      const user = await me.json()
      if (!user?.id) return this.addError('InvalidIdentityTokenErrorType', '(Discord did not return the account)')
      return { ok: true, identity: { subject: String(user.id), email: null, name: user.global_name || user.username || null } }
    } catch (exception) {
      this.log.error('Discord login failed', { exception })
      return this.addError('InvalidIdentityTokenErrorType', '(Discord could not be reached)')
    }
  }
}
