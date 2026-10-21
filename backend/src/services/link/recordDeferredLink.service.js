import { Op } from 'sequelize'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { DEFERRED_LINK_TTL_MS, detectPlatform, isPreviewBot } from '~/utils/deferredLink.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    ip: { type: ['string', 'null'], maxLength: 45 },
    userAgent: { type: ['string', 'null'], maxLength: 1024 },
    kind: { enum: ['join', 'ref'] },
    code: { type: 'string', pattern: '^[A-Z0-9]{6,12}$' }
  },
  required: ['kind', 'code']
})

/**
 * Internal: remembers that a phone just opened an invite or referral link, for
 * the app to pick up if that person installs it. Only phones' own browsers
 * count; link-preview robots and desktops are ignored. Anything older than a
 * day is deleted as a side effect, so nothing lingers.
 */
export class RecordDeferredLinkService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { ip, userAgent, kind, code } = this.args
    const { dbModels: { DeferredLink } } = this.context

    const platform = detectPlatform(userAgent)
    if (!ip || !platform || isPreviewBot(userAgent)) return { recorded: false }

    await DeferredLink.destroy({ where: { createdAt: { [Op.lt]: new Date(Date.now() - DEFERRED_LINK_TTL_MS) } } })
    // Opening the same link again (a reload) is still one link.
    const again = await DeferredLink.findOne({ where: { ip, platform, kind, code, consumedAt: null } })
    if (!again) await DeferredLink.create({ ip, platform, kind, code })
    return { recorded: true }
  }
}
