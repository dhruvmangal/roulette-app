import { RecordDeviceService } from '~/services/player'
import { locateIp, normaliseIp } from '~/utils/geo.utils'

describe('locateIp', () => {
  it('places a public address roughly, to about 1 km', () => {
    const place = locateIp('8.8.8.8')
    expect(place.country).toBe('US')
    expect(place.latitude).toBe(Math.round(place.latitude * 100) / 100)
  })

  it('says nothing about private or broken addresses', () => {
    for (const ip of ['10.0.0.4', '172.18.0.5', '192.168.1.1', '127.0.0.1', '::1', 'not an ip', null]) {
      expect(locateIp(ip)).toEqual({ country: null, region: null, city: null, latitude: null, longitude: null })
    }
  })

  it('unwraps IPv4 addresses Node reports as IPv6', () => {
    expect(normaliseIp('::ffff:8.8.8.8')).toBe('8.8.8.8')
  })
})

describe('RecordDeviceService', () => {
  const setup = () => {
    const device = { playerDeviceId: 3, visits: 4, update: jest.fn() }
    const models = {
      PlayerDevice: { findOrCreate: jest.fn(async () => [device, false]) },
      PlayerVisit: { create: jest.fn(async (values) => ({ playerVisitId: 9, ...values })), destroy: jest.fn() },
      Player: { update: jest.fn() }
    }
    const context = { dbModels: models, sequelize: { transaction: async (work) => work({}) } }
    return { device, models, context }
  }
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

  it('records the device from the user agent and the visit from the IP', async () => {
    const { device, models, context } = setup()
    const recorded = await RecordDeviceService.execute({
      playerId: 7,
      deviceId: 'a1b2c3d4e5f6a7b8c9d0',
      platform: 'web',
      ip: '::ffff:8.8.8.8',
      userAgent: iphone,
      orientation: 'portrait-primary',
      networkType: 'wifi',
      language: 'en-IN',
      timezone: 'Asia/Kolkata'
    }, context)

    expect(recorded.successful).toBe(true)
    expect(device.update).toHaveBeenCalledWith(expect.objectContaining({
      osName: 'iOS', osVersion: '17.4', deviceVendor: 'Apple', deviceModel: 'iPhone', deviceType: 'mobile', browserName: 'Mobile Safari', visits: 5
    }), expect.anything())
    expect(models.PlayerVisit.create).toHaveBeenCalledWith(expect.objectContaining({
      ip: '8.8.8.8', country: 'US', orientation: 'portrait-primary', networkType: 'wifi'
    }), expect.anything())
    expect(models.Player.update).toHaveBeenCalledWith({ country: 'US' }, expect.anything())
    expect(models.PlayerVisit.destroy).toHaveBeenCalled()
  })

  it('prefers what the app reports about the phone', async () => {
    const { device, context } = setup()
    await RecordDeviceService.execute({
      playerId: 7,
      deviceId: 'a1b2c3d4e5f6a7b8c9d0',
      platform: 'android',
      ip: '10.0.2.2',
      userAgent: 'Mozilla/5.0 (Linux; Android 14; wv)',
      native: { manufacturer: 'Google', model: 'Pixel 8a', osVersion: '14', isVirtual: true }
    }, context)

    expect(device.update).toHaveBeenCalledWith(expect.objectContaining({
      deviceVendor: 'Google', deviceModel: 'Pixel 8a', isVirtual: true, browserName: null
    }), expect.anything())
  })

  it('refuses a malformed device id', async () => {
    const { context } = setup()
    const recorded = await RecordDeviceService.execute({ playerId: 7, deviceId: 'x', platform: 'web' }, context)
    expect(recorded.successful).toBe(false)
  })
})
