import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { REFERRAL_CLAIM_BLOCKS, REFERRAL_CLAIM_WINDOW_DAYS, REFERRAL_STATUS } from '~/utils/constants/referral.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { normalizeReferralCode } from '~/utils/referral.utils'
import { withTransaction } from '~/utils/transaction.utils'
import { QualifyReferralsService } from './qualifyReferrals.service'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    code: { type: 'string', minLength: 1, maxLength: 32 }
  },
  required: ['playerId', 'code']
})

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Links a new player to the friend whose code they joined with (from a
 * referral link, or typed in within the first days). Rewards come later,
 * once the new player qualifies.
 */
export class ClaimReferralService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId } = this.args
    const code = normalizeReferralCode(this.args.code)
    const { dbModels: { Player, Referral } } = this.context

    const referral = await withTransaction(this, async (transaction) => {
      const player = await Player.findByPk(playerId, { lock: transaction.LOCK.UPDATE, transaction })
      if (!player) return this.addError('UserNotExistsErrorType', '')
      if (await Referral.findOne({ where: { refereeId: playerId }, transaction })) {
        return this.addError('ReferralNotAllowedErrorType', REFERRAL_CLAIM_BLOCKS.ALREADY_REFERRED)
      }
      if (Date.now() - player.createdAt.getTime() > REFERRAL_CLAIM_WINDOW_DAYS * DAY_MS) {
        return this.addError('ReferralNotAllowedErrorType', REFERRAL_CLAIM_BLOCKS.TOO_LATE)
      }

      const referrer = await Player.findOne({ where: { referralCode: code, status: 'active' }, transaction })
      if (!referrer) return this.addError('ReferralCodeNotFoundErrorType', '')
      if (referrer.playerId === playerId) return this.addError('ReferralNotAllowedErrorType', REFERRAL_CLAIM_BLOCKS.OWN_CODE)
      if (await Referral.findOne({ where: { referrerId: playerId, refereeId: referrer.playerId }, transaction })) {
        return this.addError('ReferralNotAllowedErrorType', REFERRAL_CLAIM_BLOCKS.REFERRED_YOU)
      }

      try {
        return await Referral.create({ referrerId: referrer.playerId, refereeId: playerId, code, status: REFERRAL_STATUS.PENDING }, { transaction })
      } catch (error) {
        // Lost a race with another claim for the same player.
        if (error.name !== 'SequelizeUniqueConstraintError') throw error
        return this.addError('ReferralNotAllowedErrorType', REFERRAL_CLAIM_BLOCKS.ALREADY_REFERRED)
      }
    })
    if (!referral) return

    // A player who already qualifies (saved account, enough rounds) is paid straight away.
    await QualifyReferralsService.execute({ playerIds: [playerId] }, this.context)
    return { referredBy: { code }, message: SUCCESS_MSG.REFERRAL_CLAIMED }
  }
}
