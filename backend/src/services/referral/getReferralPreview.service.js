import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { REFERRAL_CODE_PATTERN, REFERRAL_REWARDS } from '~/utils/constants/referral.constants'

const constraints = ajv.compile({
  type: 'object',
  properties: { code: { type: 'string', pattern: REFERRAL_CODE_PATTERN } },
  required: ['code']
})

/**
 * What a referral link's preview says: who invited you and what joining
 * gets you. Shows only the inviter's username, which the code's owner chose
 * to share by sending the link; an unknown code gets the generic invite.
 */
export class GetReferralPreviewService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { code } = this.args
    const { dbModels: { Player } } = this.context

    const referrer = await Player.findOne({ where: { referralCode: code, status: 'active' }, attributes: ['username'] })
    const reward = REFERRAL_REWARDS.FRIEND.toLocaleString('en-US')
    return {
      title: referrer ? `${referrer.username} invited you to play roulette 🎰` : 'You’re invited to play roulette 🎰',
      description: `Join with this link to earn ${reward} bonus chips, on a real 3D wheel. Play chips only, no real money.`
    }
  }
}
