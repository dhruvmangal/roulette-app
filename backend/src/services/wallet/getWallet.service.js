import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { toWalletView } from '~/utils/player.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: { playerId: { type: 'integer', minimum: 1 } },
  required: ['playerId']
})

export class GetWalletService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId } = this.args
    const { dbModels: { Wallet } } = this.context

    const wallet = await Wallet.findOne({ where: { playerId } })
    if (!wallet) return this.addError('WalletNotFoundErrorType', `for player ${playerId}`)

    return { wallet: toWalletView(wallet), message: SUCCESS_MSG.GET_SUCCESS }
  }
}
