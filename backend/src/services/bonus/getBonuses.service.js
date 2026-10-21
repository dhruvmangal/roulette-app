import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { bonusAvailability } from '~/utils/bonus.utils'
import { AUTOMATIC_BONUS_TYPES } from '~/utils/constants/bonus.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'

const constraints = ajv.compile({
  type: 'object',
  properties: { playerId: { type: 'integer', minimum: 1 } },
  required: ['playerId']
})

/** The bonuses a player can claim, with what each pays and when it is next available. */
export class GetBonusesService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId } = this.args
    const { dbModels: { Bonus, PlayerBonus, Wallet } } = this.context

    const wallet = await Wallet.findOne({ where: { playerId } })
    if (!wallet) return this.addError('WalletNotFoundErrorType', `for player ${playerId}`)

    const bonuses = await Bonus.findAll({ where: { isActive: true }, order: [['bonusId', 'ASC']] })
    const now = new Date()
    const claimable = await Promise.all(bonuses
      .filter(bonus => !AUTOMATIC_BONUS_TYPES.includes(bonus.type))
      .map(async (bonus) => {
        const lastClaim = await PlayerBonus.findOne({ where: { playerId, bonusId: bonus.bonusId }, order: [['claimNumber', 'DESC']] })
        const availability = bonusAvailability(bonus, { lastClaim, balance: wallet.balance }, now)
        return { code: bonus.code, type: bonus.type, claims: lastClaim?.claimNumber ?? 0, ...availability }
      }))

    return { bonuses: claimable, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
