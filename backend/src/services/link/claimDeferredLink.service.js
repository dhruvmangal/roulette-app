import { Op } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { DEFERRED_LINK_TTL_MS } from '~/utils/deferredLink.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    ip: { type: ['string', 'null'], maxLength: 45 },
    platform: { enum: ['ios', 'android'] }
  },
  required: ['platform']
})

/**
 * What a newly installed app asks on its first launch: did this phone's
 * network open an invite or referral link just before? Matched on IP address
 * and phone type, so it only answers when exactly one link is waiting: two
 * different people behind one address (a mobile carrier, an office) would
 * make it a guess, and a wrong guess puts a stranger's table or referral on
 * someone's screen. A link is handed over once.
 */
export class ClaimDeferredLinkService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { ip, platform } = this.args
    const { dbModels: { DeferredLink } } = this.context
    if (!ip) return { link: null, message: SUCCESS_MSG.GET_SUCCESS }

    const waiting = await DeferredLink.findAll({
      where: { ip, platform, consumedAt: null, createdAt: { [Op.gt]: new Date(Date.now() - DEFERRED_LINK_TTL_MS) } },
      order: [['createdAt', 'DESC']]
    })
    const distinct = new Set(waiting.map(row => `${row.kind}:${row.code}`))
    if (distinct.size !== 1) return { link: null, message: SUCCESS_MSG.GET_SUCCESS }

    const { kind, code } = waiting[0]
    const now = new Date()
    await Promise.all(waiting.map(row => row.update({ consumedAt: now })))
    return { link: { kind, code }, message: SUCCESS_MSG.GET_SUCCESS }
  }
}
