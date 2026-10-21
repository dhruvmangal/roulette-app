import { randomInt } from 'crypto'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import {
  REFERRAL_CLAIM_WINDOW_DAYS, REFERRAL_MAX_REWARDED, REFERRAL_REWARDS, REFERRAL_ROUNDS_REQUIRED, REFERRAL_STATUS
} from '~/utils/constants/referral.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { newReferralCode, roundsPlayedBy } from '~/utils/referral.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: { playerId: { type: 'integer', minimum: 1 } },
  required: ['playerId']
})

const CODE_ATTEMPTS = 5
const FRIENDS_SHOWN = 50
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The player's Refer & earn page: their code (made on first visit), the
 * friends who joined with it and how close each is to qualifying, and who
 * referred them.
 */
export class GetReferralsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId } = this.args
    const { dbModels: { Player, Referral }, sequelize } = this.context

    const player = await Player.findByPk(playerId)
    if (!player) return this.addError('UserNotExistsErrorType', '')

    // 31^7 codes make a clash unlikely, but retry rather than fail.
    for (let attempt = 1; !player.referralCode && attempt <= CODE_ATTEMPTS; attempt++) {
      try {
        const [updated] = await Player.update({ referralCode: newReferralCode(randomInt) }, { where: { playerId, referralCode: null } })
        if (updated || attempt === CODE_ATTEMPTS) await player.reload()
      } catch (error) {
        if (error.name !== 'SequelizeUniqueConstraintError' || attempt === CODE_ATTEMPTS) throw error
      }
    }

    const [made, referredBy, totals] = await Promise.all([
      Referral.findAll({
        where: { referrerId: playerId },
        include: [{ model: Player, as: 'referee', attributes: ['username', 'isGuest'] }],
        order: [['createdAt', 'DESC']],
        limit: FRIENDS_SHOWN
      }),
      Referral.findOne({ where: { refereeId: playerId }, include: [{ model: Player, as: 'referrer', attributes: ['username'] }] }),
      Referral.findAll({
        where: { referrerId: playerId },
        attributes: ['status', [sequelize.fn('count', sequelize.col('referral_id')), 'count'], [sequelize.fn('sum', sequelize.col('referrer_reward')), 'earned']],
        group: ['status'],
        raw: true
      })
    ])

    const rounds = await roundsPlayedBy(sequelize, [...made.map(referral => referral.refereeId), playerId])
    const progress = (referral, isGuest, played) => ({
      status: referral.status,
      savedAccount: !isGuest,
      roundsPlayed: Math.min(played ?? 0, REFERRAL_ROUNDS_REQUIRED)
    })
    const count = (status) => Number(totals.find(row => row.status === status)?.count ?? 0)
    const claimUntil = new Date(player.createdAt.getTime() + REFERRAL_CLAIM_WINDOW_DAYS * DAY_MS)

    return {
      code: player.referralCode,
      rules: {
        referrerReward: REFERRAL_REWARDS.REFERRER,
        friendReward: REFERRAL_REWARDS.FRIEND,
        roundsRequired: REFERRAL_ROUNDS_REQUIRED,
        maxRewarded: REFERRAL_MAX_REWARDED,
        claimWindowDays: REFERRAL_CLAIM_WINDOW_DAYS
      },
      totals: {
        joined: count(REFERRAL_STATUS.PENDING) + count(REFERRAL_STATUS.REWARDED) + count(REFERRAL_STATUS.REJECTED),
        pending: count(REFERRAL_STATUS.PENDING),
        rewarded: count(REFERRAL_STATUS.REWARDED),
        chipsEarned: totals.reduce((sum, row) => sum + Number(row.earned ?? 0), 0)
      },
      friends: made.map(referral => ({
        username: referral.referee.username,
        joinedAt: referral.createdAt,
        ...progress(referral, referral.referee.isGuest, rounds[referral.refereeId]),
        reward: Number(referral.referrerReward)
      })),
      referredBy: referredBy && {
        username: referredBy.referrer.username,
        ...progress(referredBy, player.isGuest, rounds[playerId]),
        reward: Number(referredBy.refereeReward)
      },
      canEnterCode: !referredBy && Date.now() < claimUntil.getTime(),
      enterCodeUntil: claimUntil,
      message: SUCCESS_MSG.GET_SUCCESS
    }
  }
}
