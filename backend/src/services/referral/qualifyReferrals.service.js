import _ from 'lodash'
import { Op } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { evaluateAchievements } from '~/services/achievement'
import { ApplyWalletTransactionService } from '~/services/wallet'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import {
  REFERRAL_MAX_REWARDED, REFERRAL_REJECT_REASONS, REFERRAL_REWARDS, REFERRAL_ROUNDS_REQUIRED, REFERRAL_STATUS
} from '~/utils/constants/referral.constants'
import { WALLET_DIRECTIONS, WALLET_REFERENCE_TYPES, WALLET_TRANSACTION_TYPES } from '~/utils/constants/wallet.constants'
import { roundsPlayedBy, shareADevice } from '~/utils/referral.utils'
import { inTransaction, withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: { playerIds: { type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 64 } },
  required: ['playerIds']
})

/**
 * Internal: pays referral rewards for any of these players who were referred
 * and now qualify (saved account + enough online rounds). Called after each
 * settled round and when a guest saves their account. Safe to call any number
 * of times: each referral is paid once, under a row lock, with idempotent
 * ledger keys.
 */
export class QualifyReferralsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerIds } = this.args
    const { dbModels: { Player, Referral }, sequelize } = this.context
    if (!playerIds.length) return { rewarded: [] }

    const pending = await Referral.findAll({ where: { refereeId: { [Op.in]: playerIds }, status: REFERRAL_STATUS.PENDING } })
    if (!pending.length) return { rewarded: [] }

    const friends = await Player.findAll({ where: { playerId: pending.map(referral => referral.refereeId) } })
    const saved = new Set(friends.filter(friend => !friend.isGuest && friend.status === 'active').map(friend => friend.playerId))
    const rounds = await roundsPlayedBy(sequelize, [...saved])
    const ready = pending.filter(referral => saved.has(referral.refereeId) && (rounds[referral.refereeId] ?? 0) >= REFERRAL_ROUNDS_REQUIRED)

    const rewarded = []
    for (const candidate of ready) {
      const wallets = await withTransaction(this, async (transaction) => {
        const referral = await Referral.findByPk(candidate.referralId, { lock: transaction.LOCK.UPDATE, transaction })
        if (referral.status !== REFERRAL_STATUS.PENDING) return null

        if (await shareADevice(sequelize, referral.referrerId, referral.refereeId, transaction)) {
          await referral.update({ status: REFERRAL_STATUS.REJECTED, rejectReason: REFERRAL_REJECT_REASONS.SAME_DEVICE }, { transaction })
          this.log.info('Referral rejected: same device', { referralId: referral.referralId })
          return null
        }

        const referrer = await Player.findByPk(referral.referrerId, { transaction })
        const paidSoFar = await Referral.count({ where: { referrerId: referral.referrerId, status: REFERRAL_STATUS.REWARDED, referrerReward: { [Op.gt]: 0 } }, transaction })
        const referrerReward = referrer?.status === 'active' && paidSoFar < REFERRAL_MAX_REWARDED ? REFERRAL_REWARDS.REFERRER : 0
        const refereeReward = REFERRAL_REWARDS.FRIEND

        const credit = (playerId, amount, side) => ApplyWalletTransactionService.execute({
          playerId,
          amount,
          direction: WALLET_DIRECTIONS.CREDIT,
          type: WALLET_TRANSACTION_TYPES.REFERRAL_BONUS,
          referenceType: WALLET_REFERENCE_TYPES.BONUS,
          referenceId: `REFERRAL:${referral.referralId}`,
          idempotencyKey: `referral:${referral.referralId}:${side}`,
          metadata: { referralId: referral.referralId, side }
        }, inTransaction(this.context, transaction))

        const paid = {}
        const friend = await credit(referral.refereeId, refereeReward, 'friend')
        if (!friend.successful) return this.mergeErrors(friend.errors)
        paid[referral.refereeId] = friend.result.wallet
        if (referrerReward) {
          const own = await credit(referral.referrerId, referrerReward, 'referrer')
          if (!own.successful) return this.mergeErrors(own.errors)
          paid[referral.referrerId] = own.result.wallet
        }

        await referral.update({ status: REFERRAL_STATUS.REWARDED, referrerReward, refereeReward, rewardedAt: new Date() }, { transaction })
        return paid
      })
      if (_.size(this.errors)) return
      if (!wallets) continue
      for (const [playerId, wallet] of Object.entries(wallets)) RouletteEmitter.walletUpdated(Number(playerId), wallet)
      rewarded.push(candidate.referralId)
      await evaluateAchievements(this.context, { playerIds: [candidate.referrerId], groups: ['referrals'] })
    }
    return { rewarded }
  }
}
