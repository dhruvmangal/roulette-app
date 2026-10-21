import { Op } from 'sequelize'
import { getApnsClient } from '~/libs/apns'
import { getFcmClient } from '~/libs/fcm'
import { isOnline } from '~/libs/presence'
import {
  NotifyPlayerService, RegisterPushTokenService, SendDailyRemindersService, SendPushService, UnregisterPushTokenService, UpdateNotificationSettingsService
} from '~/services/notification'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { MAX_PUSH_TOKENS_PER_PLAYER } from '~/utils/constants/notification.constants'

jest.mock('~/libs/fcm', () => ({ getFcmClient: jest.fn() }))
jest.mock('~/libs/apns', () => ({ getApnsClient: jest.fn() }))
jest.mock('~/libs/presence', () => ({ isOnline: jest.fn(), onlinePlayerIds: jest.fn() }))
jest.mock('~/socket-resources/emitters/roulette.emitter', () => ({ __esModule: true, default: { toPlayer: jest.fn() } }))

const TOKEN = (n) => `fcm-token-${String(n).padStart(20, '0')}`

/** In-memory tables with the query shapes the notification services use. */
function fakeDb () {
  const rows = { Player: [], PushToken: [], NotificationLog: [], Bonus: [] }
  const instance = (name, row) => {
    const copy = { ...row }
    Object.defineProperty(copy, 'update', { value: async (values) => Object.assign(copy, Object.assign(row, values)) })
    Object.defineProperty(copy, 'destroy', { value: async () => { rows[name].splice(rows[name].indexOf(row), 1) } })
    Object.defineProperty(copy, 'reload', { value: async () => Object.assign(copy, row) })
    return copy
  }
  const test = (value, condition) => (condition && typeof condition === 'object' && Op.in in condition ? condition[Op.in].includes(value) : value === condition)
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => test(row[key], value))
  const sortBy = (list, order = []) => [...list].sort((a, b) => {
    for (const [key, direction] of order) {
      if (a[key] === b[key]) continue
      return (a[key] > b[key] ? 1 : -1) * (direction === 'DESC' ? -1 : 1)
    }
    return 0
  })
  const table = (name, idKey, defaults = {}) => ({
    findOne: async ({ where }) => { const row = rows[name].find(r => matches(r, where)); return row ? instance(name, row) : null },
    findAll: async ({ where, order } = {}) => sortBy(rows[name].filter(r => matches(r, where)), order).map(row => instance(name, row)),
    findByPk: async (id) => { const row = rows[name].find(r => r[idKey] === id); return row ? instance(name, row) : null },
    count: async ({ where }) => rows[name].filter(r => matches(r, where)).length,
    destroy: async ({ where }) => { const gone = rows[name].filter(r => matches(r, where)); gone.forEach(r => rows[name].splice(rows[name].indexOf(r), 1)); return gone.length },
    create: async (values) => {
      if (name === 'NotificationLog' && values.dedupeKey && rows.NotificationLog.some(r => r.dedupeKey === values.dedupeKey)) throw Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' })
      const row = { [idKey]: rows[name].length + 1, ...defaults, ...values }
      rows[name].push(row)
      return instance(name, row)
    }
  })
  return {
    rows,
    addPlayer: (values = {}) => { const row = { playerId: rows.Player.length + 1, status: 'active', notificationPrefs: {}, ...values }; rows.Player.push(row); return row },
    context: {
      dbModels: { Player: table('Player', 'playerId'), PushToken: table('PushToken', 'pushTokenId'), NotificationLog: table('NotificationLog', 'notificationLogId'), Bonus: table('Bonus', 'bonusId') },
      sequelize: { transaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }), query: jest.fn() },
      logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn() }
    }
  }
}

let db
let client
let apns
beforeEach(() => {
  jest.clearAllMocks()
  db = fakeDb()
  client = { send: jest.fn(async () => ({ ok: true })) }
  getFcmClient.mockReturnValue(client)
  apns = { send: jest.fn(async () => ({ ok: true })) }
  getApnsClient.mockReturnValue(null)
  isOnline.mockResolvedValue(false)
})

const register = (playerId, token, extra = {}) => RegisterPushTokenService.execute({ playerId, token, platform: 'android', ...extra }, db.context)

describe('registering a phone', () => {
  it('saves the token with the phone\'s language, falling back to English', async () => {
    const ana = db.addPlayer()
    expect((await register(ana.playerId, TOKEN(1), { language: 'hi' })).successful).toBe(true)
    await register(ana.playerId, TOKEN(2), { language: 'xx' })
    expect(db.rows.PushToken.map(row => row.language)).toEqual(['hi', 'en'])
  })

  it('moves a phone to whoever signed in on it last', async () => {
    const ana = db.addPlayer()
    const bo = db.addPlayer()
    await register(ana.playerId, TOKEN(1))
    await register(bo.playerId, TOKEN(1))
    expect(db.rows.PushToken).toEqual([expect.objectContaining({ playerId: bo.playerId })])
  })

  it('keeps only the most recently used phones', async () => {
    const ana = db.addPlayer()
    for (let n = 1; n <= MAX_PUSH_TOKENS_PER_PLAYER + 2; n++) {
      await register(ana.playerId, TOKEN(n))
      db.rows.PushToken.at(-1).lastSeenAt = new Date(2026, 0, n)
    }
    await register(ana.playerId, TOKEN(1)) // seen again just now
    expect(db.rows.PushToken).toHaveLength(MAX_PUSH_TOKENS_PER_PLAYER)
    expect(db.rows.PushToken.map(row => row.token)).toContain(TOKEN(1))
    expect(db.rows.PushToken.map(row => row.token)).not.toContain(TOKEN(2))
  })

  it('refuses a token that is too short or a platform that is not one', async () => {
    const ana = db.addPlayer()
    expect((await register(ana.playerId, 'short')).successful).toBe(false)
    expect((await register(ana.playerId, TOKEN(1), { platform: 'web' })).successful).toBe(false)
  })

  it('only removes the signed-in player\'s own phone', async () => {
    const ana = db.addPlayer()
    const bo = db.addPlayer()
    await register(ana.playerId, TOKEN(1))
    expect((await UnregisterPushTokenService.execute({ playerId: bo.playerId, token: TOKEN(1) }, db.context)).result.removed).toBe(0)
    expect((await UnregisterPushTokenService.execute({ playerId: ana.playerId, token: TOKEN(1) }, db.context)).result.removed).toBe(1)
  })
})

describe('notification settings', () => {
  it('changes only what is given, and leaves the rest on', async () => {
    const ana = db.addPlayer()
    const changed = await UpdateNotificationSettingsService.execute({ playerId: ana.playerId, prefs: { friends: false } }, db.context)
    expect(changed.result.prefs).toEqual({ dailyBonus: true, friends: false, achievements: true, referrals: true, announcements: true })
    const again = await UpdateNotificationSettingsService.execute({ playerId: ana.playerId, prefs: { dailyBonus: false } }, db.context)
    expect(again.result.prefs).toEqual({ dailyBonus: false, friends: false, achievements: true, referrals: true, announcements: true })
    // A category that doesn't exist is dropped, not stored.
    const unknown = await UpdateNotificationSettingsService.execute({ playerId: ana.playerId, prefs: { spam: true } }, db.context)
    expect(Object.keys(unknown.result.prefs)).toEqual(['dailyBonus', 'friends', 'achievements', 'referrals', 'announcements'])
  })
})

describe('sending a push', () => {
  const send = (args) => SendPushService.execute({ category: 'friends', type: 'friendRequest', vars: { name: 'bo' }, ...args }, db.context)

  it('does nothing until push is configured', async () => {
    getFcmClient.mockReturnValue(null)
    getApnsClient.mockReturnValue(null)
    const ana = db.addPlayer()
    await register(ana.playerId, TOKEN(1))
    expect((await send({ playerId: ana.playerId })).result).toEqual({ sent: 0, skipped: 'not-configured' })
  })

  it('respects what the player switched off, and having no phone', async () => {
    const quiet = db.addPlayer({ notificationPrefs: { friends: false } })
    const nobody = db.addPlayer()
    await register(quiet.playerId, TOKEN(1))
    expect((await send({ playerId: quiet.playerId })).result.skipped).toBe('opted-out')
    expect((await send({ playerId: nobody.playerId })).result.skipped).toBe('no-devices')
    expect(client.send).not.toHaveBeenCalled()
  })

  it('writes to each phone in its own language, with the data the app opens', async () => {
    const ana = db.addPlayer()
    await register(ana.playerId, TOKEN(1), { language: 'en' })
    await register(ana.playerId, TOKEN(2), { language: 'fr' })
    const done = await send({ playerId: ana.playerId, data: { screen: 'friends' } })
    expect(done.result.sent).toBe(2)
    expect(client.send.mock.calls.map(([token, message]) => [token, message.body])).toEqual([
      [TOKEN(1), 'bo wants to be your friend.'],
      [TOKEN(2), 'bo souhaite devenir votre ami.']
    ])
    expect(client.send.mock.calls[0][1].data).toEqual({ type: 'friendRequest', screen: 'friends' })
  })

  it('sends Android phones through Firebase and iPhones through Apple, each in its own language', async () => {
    getApnsClient.mockReturnValue(apns)
    const ana = db.addPlayer()
    await register(ana.playerId, TOKEN(1), { platform: 'android', language: 'en' })
    await register(ana.playerId, TOKEN(2), { platform: 'ios', language: 'hi' })
    expect((await send({ playerId: ana.playerId })).result.sent).toBe(2)
    expect(client.send.mock.calls.map(([token]) => token)).toEqual([TOKEN(1)])
    expect(apns.send.mock.calls.map(([token]) => token)).toEqual([TOKEN(2)])
    expect(apns.send.mock.calls[0][1].body).toBe('bo आपके दोस्त बनना चाहते हैं।')
  })

  it('leaves out the platforms that are not set up', async () => {
    const ana = db.addPlayer()
    await register(ana.playerId, TOKEN(1), { platform: 'ios' })
    // Only Firebase is configured: an iPhone has nobody to send it.
    expect((await send({ playerId: ana.playerId })).result.skipped).toBe('no-devices')
    await register(ana.playerId, TOKEN(2), { platform: 'android' })
    expect((await send({ playerId: ana.playerId })).result.sent).toBe(1)
    expect(client.send).toHaveBeenCalledTimes(1)
  })

  it('forgets a phone that Google says is gone, and keeps going', async () => {
    const ana = db.addPlayer()
    await register(ana.playerId, TOKEN(1))
    await register(ana.playerId, TOKEN(2))
    client.send.mockResolvedValueOnce({ ok: false, reason: 'dead-token' })
    expect((await send({ playerId: ana.playerId })).result.sent).toBe(1)
    expect(db.rows.PushToken.map(row => row.token)).toEqual([TOKEN(2)])
  })

  it('sends a keyed notification only once', async () => {
    const ana = db.addPlayer()
    await register(ana.playerId, TOKEN(1))
    expect((await send({ playerId: ana.playerId, dedupeKey: 'k:1' })).result.sent).toBe(1)
    expect((await send({ playerId: ana.playerId, dedupeKey: 'k:1' })).result.skipped).toBe('duplicate')
    expect(client.send).toHaveBeenCalledTimes(1)
  })

  it('survives a delivery that throws', async () => {
    const ana = db.addPlayer()
    await register(ana.playerId, TOKEN(1))
    client.send.mockRejectedValueOnce(new Error('network down'))
    const done = await send({ playerId: ana.playerId })
    expect(done.successful).toBe(true)
    expect(done.result.sent).toBe(0)
  })
})

describe('telling a player something', () => {
  const tell = (playerId) => NotifyPlayerService.execute({
    playerId,
    event: { name: 'friend:request', payload: { from: 'bo' } },
    push: { category: 'friends', type: 'friendRequest', vars: { name: 'bo' } }
  }, db.context)

  it('shows it live to a connected player, without a push', async () => {
    const ana = db.addPlayer()
    await register(ana.playerId, TOKEN(1))
    isOnline.mockResolvedValue(true)
    await tell(ana.playerId)
    expect(RouletteEmitter.toPlayer).toHaveBeenCalledWith(ana.playerId, 'friend:request', { from: 'bo' })
    expect(client.send).not.toHaveBeenCalled()
  })

  it('pushes to a player who is not connected', async () => {
    const ana = db.addPlayer()
    await register(ana.playerId, TOKEN(1))
    await tell(ana.playerId)
    expect(RouletteEmitter.toPlayer).not.toHaveBeenCalled()
    expect(client.send).toHaveBeenCalledTimes(1)
  })

  it('still tries a push if it cannot tell whether they are online', async () => {
    const ana = db.addPlayer()
    await register(ana.playerId, TOKEN(1))
    isOnline.mockRejectedValue(new Error('redis down'))
    expect((await tell(ana.playerId)).successful).toBe(true)
    expect(client.send).toHaveBeenCalledTimes(1)
  })
})

describe('daily reminders', () => {
  const NOW = new Date('2026-10-20T12:00:00Z')
  const row = (playerId, extra = {}) => ({ playerId, claimNumber: 3, claimedAt: new Date('2026-10-19T11:30:00Z'), streakDay: 2, timezone: 'UTC', ...extra })
  const run = () => SendDailyRemindersService.execute({ now: NOW }, db.context)

  beforeEach(() => {
    db.rows.Bonus.push({ bonusId: 2, code: 'DAILY', type: 'DAILY', amount: 100, cooldownSeconds: 86400, maxClaims: null, minBalanceThreshold: null, isActive: true })
  })

  it('reminds with the streak-sized amount, once per claim', async () => {
    const ana = db.addPlayer()
    await register(ana.playerId, TOKEN(1))
    db.context.sequelize.query.mockResolvedValue([row(ana.playerId)])

    expect((await run()).result).toEqual({ reminded: 1, checked: 1 })
    expect(client.send.mock.calls[0][1]).toMatchObject({ title: 'Your daily chips are ready', body: 'Claim 300 chips and keep your streak going.', data: { type: 'dailyReady', screen: 'bonuses' } })
    expect(db.rows.NotificationLog[0].dedupeKey).toBe(`daily:${ana.playerId}:3`)
    expect((await run()).result.reminded).toBe(0)
  })

  it('leaves out players who are in the game or asleep, and reminds a lapsed streak with the day-1 amount', async () => {
    const [online, asleep, lapsed] = [db.addPlayer(), db.addPlayer(), db.addPlayer()]
    for (const player of [online, asleep, lapsed]) await register(player.playerId, TOKEN(player.playerId))
    isOnline.mockImplementation(async (id) => id === online.playerId)
    // 12:00 UTC is 05:00 in Los Angeles, inside the quiet hours. The third player claimed four days
    // ago, so the streak has lapsed (they would start over on day 1) but the bonus is still claimable.
    db.context.sequelize.query.mockResolvedValue([
      row(online.playerId),
      row(asleep.playerId, { timezone: 'America/Los_Angeles' }),
      row(lapsed.playerId, { claimedAt: new Date('2026-10-16T12:00:00Z'), streakDay: 4 })
    ])
    const done = await run()
    expect(done.result.reminded).toBe(1)
    expect(client.send).toHaveBeenCalledTimes(1)
    expect(db.rows.NotificationLog.map(log => log.playerId)).toEqual([lapsed.playerId])
    expect(client.send.mock.calls[0][1].body).toBe('Claim 100 chips and keep your streak going.')
  })

  it('does nothing without an active daily bonus', async () => {
    db.rows.Bonus.length = 0
    expect((await run()).result).toEqual({ reminded: 0 })
    expect(db.context.sequelize.query).not.toHaveBeenCalled()
  })
})
