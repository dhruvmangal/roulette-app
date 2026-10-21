import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { toProfile, toWalletView } from '~/utils/player.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: { playerId: { type: 'integer', minimum: 1 } },
  required: ['playerId']
})

export class GetProfileService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId } = this.args
    const { dbModels: { Player, PlayerIdentity, Wallet } } = this.context

    const [player, wallet, identities] = await Promise.all([
      Player.findByPk(playerId),
      Wallet.findOne({ where: { playerId } }),
      PlayerIdentity.findAll({ where: { playerId }, order: [['playerIdentityId', 'ASC']] })
    ])
    if (!player) return this.addError('UserNotExistsErrorType', '')
    if (!wallet) return this.addError('WalletNotFoundErrorType', `for player ${playerId}`)

    return { player: toProfile(player, identities), wallet: toWalletView(wallet), message: SUCCESS_MSG.GET_SUCCESS }
  }
}
