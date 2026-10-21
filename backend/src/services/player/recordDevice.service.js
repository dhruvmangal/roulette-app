import { Op } from 'sequelize'
import UAParser from 'ua-parser-js'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { locateIp, normaliseIp } from '~/utils/geo.utils'
import { withTransaction } from '~/utils/transaction.utils'

export const VISIT_RETENTION_DAYS = 90

const text = (max) => ({ type: ['string', 'null'], maxLength: max })
const size = { type: ['integer', 'null'], minimum: 0, maximum: 100000 }

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    ip: { type: ['string', 'null'] },
    userAgent: text(512),
    deviceId: { type: 'string', pattern: '^[A-Za-z0-9-]{16,64}$' },
    platform: { enum: ['web', 'ios', 'android'] },
    // Only the apps know these; a browser leaves them out.
    native: {
      type: 'object',
      properties: { manufacturer: text(64), model: text(64), osVersion: text(32), isVirtual: { type: 'boolean' } }
    },
    appVersion: text(32),
    screenWidth: size,
    screenHeight: size,
    pixelRatio: { type: ['number', 'null'], minimum: 0, maximum: 10 },
    language: text(35),
    timezone: text(64),
    orientation: text(32),
    networkType: text(16),
    networkQuality: text(16)
  },
  required: ['playerId', 'deviceId', 'platform']
})

const clip = (value, max) => (value ? String(value).slice(0, max) : null)

/**
 * Records that a player is here: on which device (created on first sight,
 * refreshed after) and from where (the request's IP, placed roughly with
 * DB-IP). Also fills in the player's country if it is unknown, and deletes
 * their visits older than VISIT_RETENTION_DAYS.
 */
export class RecordDeviceService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, deviceId, platform, native = {}, userAgent = null } = this.args
    const { dbModels: { Player, PlayerDevice, PlayerVisit } } = this.context

    const ip = normaliseIp(this.args.ip)
    const place = locateIp(ip)
    const parsed = new UAParser(userAgent || '').getResult()
    const now = new Date()

    const details = {
      platform,
      deviceType: clip(parsed.device.type ?? (platform === 'web' ? 'desktop' : 'mobile'), 16),
      deviceVendor: clip(native.manufacturer ?? parsed.device.vendor, 64),
      deviceModel: clip(native.model ?? parsed.device.model, 64),
      isVirtual: native.isVirtual === true,
      osName: clip(parsed.os.name ?? (platform === 'web' ? null : platform), 32),
      osVersion: clip(native.osVersion ?? parsed.os.version, 32),
      browserName: platform === 'web' ? clip(parsed.browser.name, 32) : null,
      browserVersion: platform === 'web' ? clip(parsed.browser.version, 32) : null,
      appVersion: this.args.appVersion ?? null,
      screenWidth: this.args.screenWidth ?? null,
      screenHeight: this.args.screenHeight ?? null,
      pixelRatio: this.args.pixelRatio ?? null,
      language: this.args.language ?? null,
      timezone: this.args.timezone ?? null,
      userAgent: clip(userAgent, 512),
      lastSeenAt: now
    }

    return withTransaction(this, async (transaction) => {
      const [device, created] = await PlayerDevice.findOrCreate({
        where: { playerId, deviceId },
        defaults: { ...details, firstSeenAt: now, visits: 0 },
        transaction
      })
      await device.update({ ...details, visits: device.visits + 1 }, { transaction })

      const visit = await PlayerVisit.create({
        playerId,
        playerDeviceId: device.playerDeviceId,
        ip,
        ...place,
        networkType: this.args.networkType ?? null,
        networkQuality: this.args.networkQuality ?? null,
        orientation: this.args.orientation ?? null
      }, { transaction })

      if (place.country) {
        await Player.update({ country: place.country }, { where: { playerId, country: { [Op.is]: null } }, transaction })
      }
      const cutoff = new Date(now.getTime() - VISIT_RETENTION_DAYS * 86400000)
      await PlayerVisit.destroy({ where: { playerId, createdAt: { [Op.lt]: cutoff } }, transaction })

      return { recorded: true, newDevice: created, visitId: visit.playerVisitId, message: SUCCESS_MSG.CREATE_SUCCESS }
    })
  }
}
