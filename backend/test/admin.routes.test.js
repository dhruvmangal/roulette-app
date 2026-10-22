import request from 'supertest'
import '~/json-schemas'
import { hashPassword, signAdminToken } from '~/utils/admin.utils'
import { signAccessToken } from '~/utils/auth.utils'

jest.mock('~/libs/redisClient', () => ({
  __esModule: true,
  default: {
    connection: {},
    publisherClient: { on: jest.fn(), status: 'ready' },
    subscriberClient: { on: jest.fn(), status: 'ready' },
    client: { call: jest.fn(), status: 'ready' }
  }
}))

jest.mock('~/libs/socketEmitter', () => {
  const to = { emit: jest.fn(), disconnectSockets: jest.fn() }
  const namespace = { to: jest.fn(() => to), in: jest.fn(() => to) }
  return { __esModule: true, default: { of: jest.fn(() => namespace), _to: to } }
})

jest.mock('~/db/models', () => {
  const { fakeLedger } = require('./helpers/fakeLedger')
  const ledger = fakeLedger()
  const AdminUser = { findOne: jest.fn(), findByPk: jest.fn(), increment: jest.fn() }
  const AdminAuditLog = { create: jest.fn(async (values) => values) }
  const Player = { findByPk: jest.fn() }
  const PlayerSession = { update: jest.fn() }
  const AppSetting = { findByPk: jest.fn(), create: jest.fn(async (values) => values) }
  return {
    __esModule: true,
    default: { ...ledger.context.dbModels, AdminUser, AdminAuditLog, Player, PlayerSession, AppSetting },
    sequelize: { ...ledger.context.sequelize, query: jest.fn() },
    ledger
  }
})

// eslint-disable-next-line import/first
import models, { ledger, sequelize } from '~/db/models'
// eslint-disable-next-line import/first
import socketEmitter from '~/libs/socketEmitter'
// eslint-disable-next-line import/first
import app from '~/rest-resources'

const { AdminUser, AdminAuditLog, Player, PlayerSession, AppSetting } = models
const PASSWORD = 'correct horse battery'
let admin

const bearer = (token) => ({ Authorization: `Bearer ${token}` })
const adminToken = () => signAdminToken(admin)

beforeAll(async () => {
  admin = { adminUserId: 1, email: 'ops@example.com', name: 'ops', status: 'active', tokenVersion: 0, passwordHash: await hashPassword(PASSWORD) }
})

beforeEach(() => {
  jest.clearAllMocks()
  admin.tokenVersion = 0
  admin.status = 'active'
  admin.update = jest.fn()
  AdminUser.findByPk.mockImplementation(async (id) => (id === admin.adminUserId ? admin : null))
})

describe('admin sign-in', () => {
  it('signs in with the right password', async () => {
    AdminUser.findOne.mockResolvedValue(admin)
    const res = await request(app).post('/api/v1/admin/auth/login').send({ email: 'OPS@example.com', password: PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.data.admin).toEqual({ adminUserId: 1, email: 'ops@example.com', name: 'ops', lastLoginAt: null })
    expect(res.body.data.admin.passwordHash).toBeUndefined()
    expect(typeof res.body.data.accessToken).toBe('string')
  })

  it('gives the same answer for a wrong password and an unknown email', async () => {
    AdminUser.findOne.mockResolvedValue(admin)
    const wrong = await request(app).post('/api/v1/admin/auth/login').send({ email: 'ops@example.com', password: 'nope' })
    AdminUser.findOne.mockResolvedValue(null)
    const unknown = await request(app).post('/api/v1/admin/auth/login').send({ email: 'who@example.com', password: PASSWORD })

    expect([wrong.status, unknown.status]).toEqual([401, 401])
    expect([wrong.body.errors[0].errorCode, unknown.body.errors[0].errorCode]).toEqual([1600, 1600])
  })

  it('refuses a disabled admin', async () => {
    AdminUser.findOne.mockResolvedValue({ ...admin, status: 'disabled' })
    const res = await request(app).post('/api/v1/admin/auth/login').send({ email: 'ops@example.com', password: PASSWORD })
    expect(res.status).toBe(401)
  })
})

describe('admin-only routes', () => {
  it('need a token', async () => {
    const res = await request(app).get('/api/v1/admin/players')
    expect(res.status).toBe(401)
    expect(res.body.errors[0].errorCode).toBe(1601)
  })

  it('never accept a player token', async () => {
    const playerToken = signAccessToken({ playerId: 1, tokenVersion: 0, type: 'access', adminUserId: 1 })
    const res = await request(app).get('/api/v1/admin/auth/me').set(bearer(playerToken))
    expect(res.status).toBe(401)
  })

  it('stop accepting a token after logout', async () => {
    const token = adminToken()
    expect((await request(app).get('/api/v1/admin/auth/me').set(bearer(token))).status).toBe(200)

    admin.tokenVersion = 1
    expect((await request(app).get('/api/v1/admin/auth/me').set(bearer(token))).status).toBe(401)
  })
})

describe('POST /api/v1/admin/players/:playerId/wallet/adjust', () => {
  const adjust = (body, playerId = 5) => request(app)
    .post(`/api/v1/admin/players/${playerId}/wallet/adjust`)
    .set(bearer(adminToken()))
    .send(body)

  beforeAll(() => ledger.openWallet(5, 100))

  it('requires a reason', async () => {
    const res = await adjust({ direction: 'CREDIT', amount: 50, requestId: 'req-00000001' })
    expect(res.status).toBe(400)
  })

  it('credits through the ledger, names the admin, and audits it once', async () => {
    const body = { direction: 'CREDIT', amount: 50, reason: 'Goodwill for lost round', requestId: 'req-00000002' }
    const res = await adjust(body)

    expect(res.status).toBe(200)
    expect(res.body.data.wallet.balance).toBe(150)
    expect(res.body.data.walletTransaction).toMatchObject({
      type: 'ADMIN_ADJUST',
      referenceType: 'ADMIN',
      referenceId: '1',
      idempotencyKey: 'admin:req-00000002',
      metadata: { reason: 'Goodwill for lost round', adminUserId: 1, adminEmail: 'ops@example.com' }
    })
    expect(AdminAuditLog.create).toHaveBeenCalledTimes(1)
    expect(socketEmitter._to.emit).toHaveBeenCalledWith('wallet:updated', expect.anything())

    // A double-submit of the same form moves chips once.
    const again = await adjust(body)
    expect(again.body.data.replayed).toBe(true)
    expect(ledger.balanceOf(5)).toBe(150)
    expect(AdminAuditLog.create).toHaveBeenCalledTimes(1)
  })

  it('never debits below zero', async () => {
    const res = await adjust({ direction: 'DEBIT', amount: 10000, reason: 'Clawback', requestId: 'req-00000003' })
    expect(res.status).toBe(400)
    expect(res.body.errors[0].errorCode).toBe(1301)
    expect(ledger.balanceOf(5)).toBe(150)
    expect(AdminAuditLog.create).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/v1/admin/players/:playerId/status', () => {
  it('bans: revokes tokens and sessions, drops sockets, and audits the reason', async () => {
    const player = { playerId: 9, username: 'cheater', status: 'active', tokenVersion: 3, update: jest.fn() }
    Player.findByPk.mockResolvedValue(player)

    const res = await request(app).patch('/api/v1/admin/players/9/status').set(bearer(adminToken()))
      .send({ status: 'banned', reason: 'Multi-accounting' })

    expect(res.status).toBe(200)
    expect(player.update).toHaveBeenCalledWith({ status: 'banned', tokenVersion: 4 }, expect.anything())
    expect(PlayerSession.update).toHaveBeenCalled()
    expect(socketEmitter._to.disconnectSockets).toHaveBeenCalledWith(true)
    expect(AdminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PLAYER_STATUS', targetId: '9', details: { from: 'active', to: 'banned', reason: 'Multi-accounting' }
    }), expect.anything())
  })

  it('reinstating keeps existing sessions', async () => {
    const player = { playerId: 9, username: 'cheater', status: 'banned', tokenVersion: 4, update: jest.fn() }
    Player.findByPk.mockResolvedValue(player)

    await request(app).patch('/api/v1/admin/players/9/status').set(bearer(adminToken())).send({ status: 'active', reason: 'Appeal upheld' })

    expect(player.update).toHaveBeenCalledWith({ status: 'active' }, expect.anything())
    expect(PlayerSession.update).not.toHaveBeenCalled()
    expect(socketEmitter._to.disconnectSockets).not.toHaveBeenCalled()
  })
})

describe('GET /api/v1/admin/referrals', () => {
  const row = { referralId: 4, status: 'REJECTED', rejectReason: 'SAME_DEVICE', code: 'K7QM2XA', referrerReward: '0', refereeReward: '0', referrerId: 1, refereeId: 2, totalCount: '1' }

  it('needs an admin', async () => {
    expect((await request(app).get('/api/v1/admin/referrals')).status).toBe(401)
  })

  it('lists referrals with totals across all of them, filtered by status', async () => {
    sequelize.query.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ total: 3, pending: 1, rewarded: 1, rejected: 1, chipsPaid: '1500', referrers: 2 }])
    const res = await request(app).get('/api/v1/admin/referrals?status=REJECTED&playerId=2&pageNo=1&limit=10').set(bearer(adminToken()))

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ count: '1', pageNo: 1, limit: 10, totals: { total: 3, chipsPaid: 1500 } })
    expect(res.body.data.referrals).toEqual([expect.objectContaining({ referralId: 4, status: 'REJECTED', rejectReason: 'SAME_DEVICE', referrerReward: 0 })])
    expect(res.body.data.referrals[0].totalCount).toBeUndefined()
    expect(sequelize.query.mock.calls[0][1].replacements).toMatchObject({ status: 'REJECTED', playerId: 2, size: 10, offset: 0 })
  })

  it('refuses an unknown status', async () => {
    const res = await request(app).get('/api/v1/admin/referrals?status=PAID').set(bearer(adminToken()))
    expect(res.status).toBe(400)
  })
})

describe('admin push notifications', () => {
  const announcement = { title: 'Double chips', body: 'Claim your bonus today.', audience: 'ALL', requestId: 'form-0001-abcd' }

  it('need an admin', async () => {
    expect((await request(app).post('/api/v1/admin/announcements').send(announcement)).status).toBe(401)
    expect((await request(app).get('/api/v1/admin/announcements')).status).toBe(401)
    expect((await request(app).get('/api/v1/admin/announcements/reach?audience=ALL')).status).toBe(401)
  })

  it('refuse text that is too long, an unknown audience, and a form without its id', async () => {
    const post = (body) => request(app).post('/api/v1/admin/announcements').set(bearer(adminToken())).send(body)
    expect((await post({ ...announcement, title: 'x'.repeat(66) })).status).toBe(400)
    expect((await post({ ...announcement, body: 'x'.repeat(179) })).status).toBe(400)
    expect((await post({ ...announcement, audience: 'EVERYONE' })).status).toBe(400)
    expect((await post({ title: 'hi', body: 'there', audience: 'ALL' })).status).toBe(400)
  })

  it('say plainly that push is off while the server has no Firebase or Apple key', async () => {
    const res = await request(app).post('/api/v1/admin/announcements').set(bearer(adminToken())).send(announcement)
    expect(res.status).toBe(503)
    expect(res.body.errors[0]).toMatchObject({ name: 'PushNotConfigured', errorCode: 1606 })
  })

  it('check the reach query\'s audience', async () => {
    const get = (query) => request(app).get(`/api/v1/admin/announcements/reach?${query}`).set(bearer(adminToken()))
    expect((await get('audience=EVERYONE')).status).toBe(400)
    expect((await get('days=7')).status).toBe(400)
    expect((await get('audience=INACTIVE')).status).toBe(400)
  })
})

describe('ads settings', () => {
  const get = () => request(app).get('/api/v1/admin/settings/ads').set(bearer(adminToken()))
  const patch = (body) => request(app).patch('/api/v1/admin/settings/ads').set(bearer(adminToken())).send(body)

  it('need an admin', async () => {
    expect((await request(app).get('/api/v1/admin/settings/ads')).status).toBe(401)
    expect((await request(app).patch('/api/v1/admin/settings/ads').send({ web: false })).status).toBe(401)
  })

  it('are on for both until an admin changes them', async () => {
    AppSetting.findByPk.mockResolvedValue(null)
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.body.data.ads).toEqual({ web: true, app: true })
  })

  it('turn off one side only, keep the other, and audit the change', async () => {
    AppSetting.findByPk.mockResolvedValue(null)
    const res = await patch({ web: false })

    expect(res.status).toBe(200)
    expect(res.body.data.ads).toEqual({ web: false, app: true })
    expect(AppSetting.create).toHaveBeenCalledWith({ key: 'ads', value: { web: false, app: true } }, expect.anything())
    expect(AdminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SETTINGS_UPDATE',
      targetType: 'SETTING',
      targetId: 'ads',
      details: { before: { web: true, app: true }, after: { web: false, app: true } }
    }), expect.anything())
  })

  it('update the stored row when there is one', async () => {
    const row = { value: { web: false, app: true }, update: jest.fn() }
    AppSetting.findByPk.mockResolvedValue(row)
    const res = await patch({ app: false })

    expect(res.body.data.ads).toEqual({ web: false, app: false })
    expect(row.update).toHaveBeenCalledWith({ value: { web: false, app: false } }, expect.anything())
    expect(AppSetting.create).not.toHaveBeenCalled()
  })

  it('refuse an empty change, a non-boolean and an unknown switch', async () => {
    const statuses = []
    for (const body of [{}, { web: 'no' }, { tv: false }]) statuses.push((await patch(body)).status)
    expect(statuses).toEqual([400, 400, 400])
  })
})

describe('GET /api/v1/config', () => {
  it('is public and reports the ads switches', async () => {
    AppSetting.findByPk.mockResolvedValue({ value: { web: true, app: false } })
    const res = await request(app).get('/api/v1/config')
    expect(res.status).toBe(200)
    expect(res.body.data.config).toEqual({ ads: { web: true, app: false } })
  })

  it('treats a damaged value as the default (on)', async () => {
    AppSetting.findByPk.mockResolvedValue({ value: { web: 'yes' } })
    const res = await request(app).get('/api/v1/config')
    expect(res.body.data.config.ads).toEqual({ web: true, app: true })
  })
})
