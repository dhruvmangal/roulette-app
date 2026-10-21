import request from 'supertest'
import '~/json-schemas'
import { ClaimDeferredLinkService, RecordDeferredLinkService } from '~/services/link'
import { DEFERRED_LINK_TTL_MS, detectPlatform, isPreviewBot } from '~/utils/deferredLink.utils'

jest.mock('~/libs/redisClient', () => ({
  __esModule: true,
  default: {
    connection: {},
    publisherClient: { on: jest.fn(), status: 'ready' },
    subscriberClient: { on: jest.fn(), status: 'ready' },
    client: { call: jest.fn(), status: 'ready' }
  }
}))
jest.mock('~/db/models', () => {
  const { Op } = require('sequelize')
  const rows = []
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if (Op.lt in value) return row[key] < value[Op.lt]
      if (Op.gt in value) return row[key] > value[Op.gt]
    }
    return value === null ? row[key] == null : row[key] === value
  })
  const instance = (row) => Object.assign({}, row, { update: async (values) => Object.assign(row, values) })
  const DeferredLink = {
    rows,
    findAll: jest.fn(async ({ where }) => rows.filter(row => matches(row, where)).sort((a, b) => b.createdAt - a.createdAt).map(instance)),
    findOne: jest.fn(async ({ where }) => { const row = rows.find(r => matches(r, where)); return row ? instance(row) : null }),
    create: jest.fn(async (values) => { const row = { deferredLinkId: rows.length + 1, consumedAt: null, createdAt: new Date(), ...values }; rows.push(row); return instance(row) }),
    destroy: jest.fn(async ({ where }) => { const gone = rows.filter(row => matches(row, where)); gone.forEach(row => rows.splice(rows.indexOf(row), 1)); return gone.length })
  }
  return { __esModule: true, default: { DeferredLink, Player: { findOne: jest.fn(async () => ({ username: 'ana' })) }, Room: { findOne: jest.fn(async () => null) }, RoomPlayer: { count: jest.fn(async () => 0) } }, sequelize: { query: jest.fn() } }
})

// eslint-disable-next-line import/first
import models from '~/db/models'
// eslint-disable-next-line import/first
import app from '~/rest-resources'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const WHATSAPP = 'WhatsApp/2.24.10.80 A'
const FACEBOOK = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
const TELEGRAM = 'TelegramBot (like TwitterBot)'
// iMessage previews are fetched by a robot that says it is iPhone Safari with these tags.
const IMESSAGE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 facebookexternalhit/1.1 Facebot Twitterbot/1.0'

const { DeferredLink } = models
const context = { dbModels: models, sequelize: models.sequelize }
const record = (args) => RecordDeferredLinkService.execute({ ip: '203.0.113.9', userAgent: IPHONE, kind: 'ref', code: 'K7QM2XA', ...args }, context)
const claim = (args) => ClaimDeferredLinkService.execute({ ip: '203.0.113.9', platform: 'ios', ...args }, context)

beforeEach(() => {
  DeferredLink.rows.length = 0
  jest.clearAllMocks()
})

describe('telling phones from robots', () => {
  it('knows iPhones and Androids, and nothing else', () => {
    expect(detectPlatform(IPHONE)).toBe('ios')
    expect(detectPlatform(ANDROID)).toBe('android')
    expect(detectPlatform(DESKTOP)).toBeNull()
    expect(detectPlatform(undefined)).toBeNull()
  })

  it('recognises link-preview robots, including one pretending to be an iPhone', () => {
    for (const robot of [WHATSAPP, FACEBOOK, TELEGRAM, IMESSAGE, 'Googlebot/2.1', 'Slackbot-LinkExpanding 1.0', '', undefined]) expect(isPreviewBot(robot)).toBe(true)
    for (const person of [IPHONE, ANDROID, DESKTOP]) expect(isPreviewBot(person)).toBe(false)
  })
})

describe('remembering a tapped link', () => {
  it('keeps what a phone opened, once however often it is reloaded', async () => {
    expect((await record()).result).toEqual({ recorded: true })
    await record()
    expect(DeferredLink.rows).toEqual([expect.objectContaining({ ip: '203.0.113.9', platform: 'ios', kind: 'ref', code: 'K7QM2XA', consumedAt: null })])
  })

  it('ignores robots, desktops and requests without an address', async () => {
    for (const args of [{ userAgent: WHATSAPP }, { userAgent: IMESSAGE }, { userAgent: DESKTOP }, { ip: null }]) expect((await record(args)).result).toEqual({ recorded: false })
    expect(DeferredLink.rows).toHaveLength(0)
  })

  it('deletes what is more than a day old', async () => {
    DeferredLink.rows.push({ deferredLinkId: 99, ip: '198.51.100.1', platform: 'ios', kind: 'join', code: 'AB12CD', consumedAt: null, createdAt: new Date(Date.now() - DEFERRED_LINK_TTL_MS - 1000) })
    await record()
    expect(DeferredLink.rows.map(row => row.code)).toEqual(['K7QM2XA'])
  })
})

describe('the app asking on its first launch', () => {
  it('is handed the link once, and only once', async () => {
    await record()
    expect((await claim()).result.link).toEqual({ kind: 'ref', code: 'K7QM2XA' })
    expect((await claim()).result.link).toBeNull()
  })

  it('is handed nothing when two different links are waiting behind one address', async () => {
    await record()
    await record({ kind: 'join', code: 'AB12CD' })
    expect((await claim()).result.link).toBeNull()
  })

  it('is handed the link though it was opened twice', async () => {
    await record()
    DeferredLink.rows.push({ ...DeferredLink.rows[0], deferredLinkId: 50, createdAt: new Date() })
    expect((await claim()).result.link).toEqual({ kind: 'ref', code: 'K7QM2XA' })
  })

  it('does not hand a link to a different address, a different phone type, or after a day', async () => {
    await record()
    expect((await claim({ ip: '198.51.100.7' })).result.link).toBeNull()
    expect((await claim({ platform: 'android' })).result.link).toBeNull()
    DeferredLink.rows[0].createdAt = new Date(Date.now() - DEFERRED_LINK_TTL_MS - 1000)
    expect((await claim()).result.link).toBeNull()
    expect((await claim({ ip: null })).result.link).toBeNull()
  })

  it('refuses an unknown phone type', async () => {
    expect((await claim({ platform: 'windows' })).successful).toBe(false)
  })
})

describe('the shared link pages', () => {
  it('remember a phone that opens them, and not a robot', async () => {
    await request(app).get('/r/K7QM2XA').set('User-Agent', IPHONE)
    await request(app).get('/join/AB12CD').set('User-Agent', ANDROID)
    await request(app).get('/r/K7QM2XA').set('User-Agent', IMESSAGE)
    await request(app).get('/join/AB12CD').set('User-Agent', WHATSAPP)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(DeferredLink.rows.map(row => [row.platform, row.kind, row.code])).toEqual([['ios', 'ref', 'K7QM2XA'], ['android', 'join', 'AB12CD']])
  })

  it('answer the app over HTTP, from the address it connects from', async () => {
    await request(app).get('/r/K7QM2XA').set('User-Agent', IPHONE)
    await new Promise(resolve => setTimeout(resolve, 50))
    const res = await request(app).post('/api/v1/links/deferred').send({ platform: 'ios' })
    expect(res.status).toBe(200)
    // supertest connects from loopback, as both requests did, so they match.
    expect(res.body.data.link).toEqual({ kind: 'ref', code: 'K7QM2XA' })
    expect((await request(app).post('/api/v1/links/deferred').send({ platform: 'ios' })).body.data.link).toBeNull()
    expect((await request(app).post('/api/v1/links/deferred').send({ platform: 'symbian' })).status).toBe(400)
  })
})
