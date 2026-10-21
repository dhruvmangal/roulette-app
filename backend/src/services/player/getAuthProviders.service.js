import config from '~/configs/app.config'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'

const firstId = (ids) => ids.split(',').map(id => id.trim()).find(Boolean) ?? null

/**
 * Which sign-in providers are on, and the public client ID each sign-in
 * button needs, so apps read it from the server rather than a build setting.
 * The web client is the first ID listed in each variable.
 */
export class GetAuthProvidersService extends ServiceBase {
  async run () {
    const google = firstId(config.get('auth.googleClientIds'))
    const apple = firstId(config.get('auth.appleClientIds'))
    // Only usable with the secret too: without it the login code can't be exchanged.
    const discord = config.get('auth.discordClientId') && config.get('auth.discordClientSecret') ? config.get('auth.discordClientId') : null
    return {
      providers: {
        google: google ? { clientId: google } : null,
        apple: apple ? { clientId: apple } : null,
        discord: discord ? { clientId: discord } : null
      },
      message: SUCCESS_MSG.GET_SUCCESS
    }
  }
}
