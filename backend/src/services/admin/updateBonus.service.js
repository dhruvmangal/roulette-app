import _ from 'lodash'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { recordAudit } from '~/utils/admin.utils'
import { ADMIN_ACTIONS, ADMIN_TARGETS } from '~/utils/constants/admin.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { withTransaction } from '~/utils/transaction.utils'

const EDITABLE = ['amount', 'cooldownSeconds', 'maxClaims', 'minBalanceThreshold', 'isActive']

const constraints = ajv.compile({
  type: 'object',
  properties: {
    bonusId: { type: 'integer', minimum: 1 },
    amount: { type: 'integer', minimum: 1, maximum: 1e9 },
    cooldownSeconds: { type: ['integer', 'null'], minimum: 0 },
    maxClaims: { type: ['integer', 'null'], minimum: 1 },
    minBalanceThreshold: { type: ['integer', 'null'], minimum: 0 },
    isActive: { type: 'boolean' }
  },
  required: ['bonusId']
})

/** Changes a bonus's amount, limits or on/off switch; takes effect on the next claim. */
export class UpdateBonusService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { bonusId } = this.args
    const { dbModels: { Bonus } } = this.context
    const changes = _.pick(this.args, EDITABLE)

    return withTransaction(this, async (transaction) => {
      const bonus = await Bonus.findByPk(bonusId, { lock: transaction.LOCK.UPDATE, transaction })
      if (!bonus) return this.addError('BonusNotFoundErrorType', `#${bonusId}`)

      const before = _.pick(bonus.get({ plain: true }), Object.keys(changes))
      await bonus.update(changes, { transaction })
      await recordAudit(this.context, transaction, {
        action: ADMIN_ACTIONS.BONUS_UPDATE,
        targetType: ADMIN_TARGETS.BONUS,
        targetId: bonusId,
        details: { code: bonus.code, before, after: changes }
      })
      return { bonus: bonus.get({ plain: true }), message: SUCCESS_MSG.UPDATE_SUCCESS }
    })
  }
}
