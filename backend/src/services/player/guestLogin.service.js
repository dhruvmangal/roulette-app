import { randomInt } from 'crypto'
import ServiceBase from '~/services/serviceBase'
import { GUEST_USERNAME_PREFIX } from '~/utils/constants/player.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { CreatePlayerService } from './createPlayer.service'
import { StartSessionService } from './startSession.service'

const SUFFIX_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const SUFFIX_LENGTH = 8
const ATTEMPTS = 3

const guestUsername = () =>
  GUEST_USERNAME_PREFIX + Array.from({ length: SUFFIX_LENGTH }, () => SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)]).join('')

/**
 * Creates a guest account with a random name. The guest keeps playing by
 * refreshing its tokens until it links a Google or Apple account.
 */
export class GuestLoginService extends ServiceBase {
  async run () {
    // A clash among 31^8 names is vanishingly rare, but retry rather than fail.
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const created = await CreatePlayerService.execute({ username: guestUsername(), isGuest: true }, this.context)
      if (created.successful) {
        const { player, wallet, tokenVersion } = created.result
        const session = await StartSessionService.execute({ playerId: player.playerId, tokenVersion }, this.context)
        if (!session.successful) return this.mergeErrors(session.errors)
        return { player, wallet, tokens: session.result.tokens, message: SUCCESS_MSG.SIGN_UP_SUCCESS }
      }
      const usernameClash = Object.keys(created.errors.CreatePlayerService || {}).includes('UsernameTakenErrorType')
      if (!usernameClash || attempt === ATTEMPTS) return this.mergeErrors(created.errors)
    }
  }
}
