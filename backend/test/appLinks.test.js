import request from 'supertest'
import '~/json-schemas'
import config from '~/configs/app.config'
import { androidAssetLinks, appleAppSiteAssociation } from '~/utils/appLinks.utils'

jest.mock('~/libs/redisClient', () => ({
  __esModule: true,
  default: {
    connection: {},
    publisherClient: { on: jest.fn(), status: 'ready' },
    subscriberClient: { on: jest.fn(), status: 'ready' },
    client: { call: jest.fn(), status: 'ready' }
  }
}))
jest.mock('~/db/models', () => ({ __esModule: true, default: { Player: { findOne: jest.fn() } }, sequelize: { query: jest.fn() } }))

// eslint-disable-next-line import/first
import models from '~/db/models'
// eslint-disable-next-line import/first
import app from '~/rest-resources'

const SHA = Array.from({ length: 32 }, (_, i) => (i * 7 % 256).toString(16).padStart(2, '0').toUpperCase()).join(':')

describe('the files that let links open the app', () => {
  it('names the iOS app and the link paths once the team ID is known', () => {
    expect(appleAppSiteAssociation('abcde12345')).toEqual({
      applinks: { details: [{ appIDs: ['ABCDE12345.com.roulette.game'], components: [{ '/': '/join/*' }, { '/': '/r/*' }] }] }
    })
  })

  it('serves nothing for a missing or malformed team ID or fingerprint', () => {
    for (const bad of ['', undefined, 'short', 'has spaces!']) expect(appleAppSiteAssociation(bad)).toBeNull()
    for (const bad of ['', undefined, 'AA:BB', `${SHA},nope`]) expect(androidAssetLinks(bad)).toBeNull()
  })

  it('names the Android package and every signing certificate', () => {
    const other = SHA.toLowerCase().split(':').reverse().join(':')
    const [entry] = androidAssetLinks(`${SHA}, ${other}`)
    expect(entry.relation).toEqual(['delegate_permission/common.handle_all_urls'])
    expect(entry.target).toEqual({ namespace: 'android_app', package_name: 'com.roulette.game', sha256_cert_fingerprints: [SHA, other.toUpperCase()] })
  })

  it('answers over HTTP only when configured', async () => {
    const get = jest.spyOn(config, 'get')
    get.mockImplementation((key) => ({ 'appLinks.appleTeamId': '', 'appLinks.androidCertSha256': '' })[key])
    expect((await request(app).get('/.well-known/apple-app-site-association')).status).toBe(404)
    expect((await request(app).get('/.well-known/assetlinks.json')).status).toBe(404)

    get.mockImplementation((key) => ({ 'appLinks.appleTeamId': 'ABCDE12345', 'appLinks.androidCertSha256': SHA })[key])
    const apple = await request(app).get('/.well-known/apple-app-site-association')
    expect(apple.status).toBe(200)
    expect(apple.headers['content-type']).toMatch(/application\/json/)
    expect(apple.body.applinks.details[0].appIDs).toEqual(['ABCDE12345.com.roulette.game'])
    expect((await request(app).get('/.well-known/assetlinks.json')).body[0].target.package_name).toBe('com.roulette.game')
    get.mockRestore()
  })
})

describe('the referral link page (/r/CODE)', () => {
  it('previews who invited you, with the referral image, and forwards to the game', async () => {
    models.Player.findOne.mockResolvedValue({ username: 'ana' })
    const res = await request(app).get('/r/k7qm2xa').set('Host', 'play.example.com')

    expect(res.status).toBe(200)
    expect(res.text).toContain('og:title" content="ana invited you to play roulette')
    expect(res.text).toContain('og:image" content="http://play.example.com/og-referral.jpg"')
    expect(res.text).toContain('og:url" content="http://play.example.com/r/K7QM2XA"')
    expect(res.text).toContain('url=http://play.example.com/?ref=K7QM2XA')
    expect(res.text).toContain('Claim your bonus chips')
    expect(models.Player.findOne.mock.calls[0][0].where).toEqual({ referralCode: 'K7QM2XA', status: 'active' })
  })

  it('still shows a generic invite for an unknown code, and refuses a malformed one', async () => {
    models.Player.findOne.mockResolvedValue(null)
    const unknown = await request(app).get('/r/ZZZZZZZ')
    expect(unknown.status).toBe(200)
    expect(unknown.text).toContain('You’re invited to play roulette')
    expect((await request(app).get('/r/short')).status).toBe(400)
  })

  it('escapes anything it prints', async () => {
    models.Player.findOne.mockResolvedValue({ username: '<img src=x onerror=alert(1)>' })
    const res = await request(app).get('/r/K7QM2XA')
    expect(res.text).not.toContain('<img src=x')
    expect(res.text).toContain('&lt;img src=x')
  })
})
