import { Op } from 'sequelize'
import { getApnsClient } from '~/libs/apns'
import { getFcmClient } from '~/libs/fcm'
import { GetAnnouncementReachService, SendAnnouncementService } from '~/services/admin'
import { SendPushService } from '~/services/notification'
import { audiencePlayerIds, audienceReach, whyUnreachable } from '~/utils/announcement.utils'
import { recordAudit } from '~/utils/admin.utils'
import { ANNOUNCEMENT_BROADCASTS_PER_DAY } from '~/utils/constants/notification.constants'

jest.mock('~/libs/fcm', () => ({ getFcmClient: jest.fn() }))
jest.mock('~/libs/apns', () => ({ getApnsClient: jest.fn() }))
jest.mock('~/services/notification', () => ({ SendPushService: { execute: jest.fn() } }))
jest.mock('~/utils/announcement.utils', () => ({ audienceReach: jest.fn(), audiencePlayerIds: jest.fn(), whyUnreachable: jest.fn() }))
jest.mock('~/utils/admin.utils', () => ({ ...jest.requireActual('~/utils/admin.utils'), recordAudit: jest.fn() }))

/** In-memory announcements with the query shapes the service uses. */
function fakeDb () {
  const rows = []
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if (Op.gt in value) return row[key] > value[Op.gt]
      if (Op.ne in value) return row[key] !== value[Op.ne]
    }
    return row[key] === value
  })
  const instance = (row) => Object.assign({}, row, {
    update: async (values) => Object.assign(row, values),
    get: () => ({ ...row })
  })
  return {
    rows,
    context: {
      admin: { adminUserId: 1, email: 'ops@example.com' },
      dbModels: {
        Announcement: {
          findOne: async ({ where }) => { const row = rows.find(r => matches(r, where)); return row ? instance(row) : null },
          count: async ({ where }) => rows.filter(r => matches(r, where)).length,
          create: async (values) => {
            const row = { announcementId: rows.length + 1, status: 'SENDING', sent: 0, skipped: {}, error: null, finishedAt: null, createdAt: new Date(), ...values }
            rows.push(row)
            return instance(row)
          }
        }
      },
      sequelize: { transaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }) },
      logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn() }
    }
  }
}

const form = (extra = {}) => ({ title: 'Double chips weekend', body: 'Claim your daily bonus today.', audience: 'ALL', requestId: 'form-0001-abcd', ...extra })
const settled = async (db, id = 1) => { for (let i = 0; i < 200 && db.rows[id - 1].status === 'SENDING'; i++) await new Promise(resolve => setImmediate(resolve)) }
const errorKeys = (service) => Object.values(service.errors).flatMap(errors => Array.isArray(errors) ? errors : Object.keys(errors))

let db
beforeEach(() => {
  jest.clearAllMocks()
  db = fakeDb()
  getFcmClient.mockReturnValue({ send: jest.fn() })
  getApnsClient.mockReturnValue(null)
  audienceReach.mockResolvedValue({ players: 3, phones: 4 })
  whyUnreachable.mockResolvedValue(null)
  // Two batches of players, then none.
  audiencePlayerIds.mockImplementation(async (sequelize, target, afterId) => (afterId === 0 ? [11, 12, 13] : []))
  SendPushService.execute.mockImplementation(async () => ({ successful: true, result: { sent: 1 } }))
})

const send = (args) => SendAnnouncementService.execute(form(args), db.context)

describe('before sending', () => {
  it('says who an audience reaches and whether push is set up', async () => {
    getApnsClient.mockReturnValue({ send: jest.fn() })
    const reach = await GetAnnouncementReachService.execute({ audience: 'INACTIVE', days: 7 }, db.context)
    expect(reach.result).toMatchObject({ players: 3, phones: 4, unreachable: null, configured: { android: true, ios: true } })
    expect(audienceReach).toHaveBeenCalledWith(db.context.sequelize, { audience: 'INACTIVE', days: 7, playerId: null })
  })

  it('says why one player cannot be reached', async () => {
    audienceReach.mockResolvedValue({ players: 0, phones: 0 })
    whyUnreachable.mockResolvedValue('opted-out')
    const reach = await GetAnnouncementReachService.execute({ audience: 'PLAYER', playerId: 9 }, db.context)
    expect(reach.result).toMatchObject({ players: 0, unreachable: 'opted-out' })
  })

  it('needs the days for an inactive audience and the player for a single one', async () => {
    expect((await GetAnnouncementReachService.execute({ audience: 'INACTIVE' }, db.context)).successful).toBe(false)
    expect((await GetAnnouncementReachService.execute({ audience: 'PLAYER' }, db.context)).successful).toBe(false)
  })
})

describe('sending to a group', () => {
  it('answers at once, then sends in the background and records how it went', async () => {
    SendPushService.execute
      .mockResolvedValueOnce({ successful: true, result: { sent: 2 } })
      .mockResolvedValueOnce({ successful: true, result: { sent: 0, skipped: 'opted-out' } })
      .mockResolvedValueOnce({ successful: true, result: { sent: 1 } })
    const done = await send()

    expect(done.successful).toBe(true)
    expect(done.result.announcement).toMatchObject({ announcementId: 1, status: 'SENDING', targeted: 3, audience: 'ALL' })
    await settled(db)
    expect(db.rows[0]).toMatchObject({ status: 'SENT', sent: 3, skipped: { 'opted-out': 1 } })
    expect(db.rows[0].finishedAt).toBeInstanceOf(Date)
  })

  it('sends the admin\'s own words with a key per player, so a retry can\'t send twice', async () => {
    await send()
    await settled(db)
    expect(SendPushService.execute.mock.calls.map(([args]) => [args.playerId, args.dedupeKey])).toEqual([
      [11, 'announcement:1:11'], [12, 'announcement:1:12'], [13, 'announcement:1:13']
    ])
    expect(SendPushService.execute.mock.calls[0][0]).toMatchObject({
      category: 'announcements', custom: { title: 'Double chips weekend', body: 'Claim your daily bonus today.' }, data: { screen: 'home' }
    })
  })

  it('writes the audit entry naming what went out', async () => {
    await send({ audience: 'INACTIVE', days: 14 })
    await settled(db)
    expect(recordAudit.mock.calls[0][2]).toMatchObject({
      action: 'ANNOUNCEMENT_SEND', targetType: 'ANNOUNCEMENT', targetId: 1, details: { title: 'Double chips weekend', audience: 'INACTIVE', days: 14, targeted: 3 }
    })
  })

  it('counts a player whose push fails, and marks the announcement failed if the send itself breaks', async () => {
    SendPushService.execute.mockResolvedValueOnce({ successful: false, errors: { x: 'y' } })
    await send()
    await settled(db)
    expect(db.rows[0]).toMatchObject({ status: 'SENT', sent: 2, skipped: { error: 1 } })

    audiencePlayerIds.mockRejectedValue(new Error('database went away'))
    await send({ requestId: 'form-0002-abcd' })
    await settled(db, 2)
    expect(db.rows[1]).toMatchObject({ status: 'FAILED', error: 'database went away' })
  })

  it('refuses to send to nobody, and limits broadcasts per day', async () => {
    audienceReach.mockResolvedValue({ players: 0, phones: 0 })
    expect(errorKeys(await send())).toContain('AnnouncementNoRecipientsErrorType')

    audienceReach.mockResolvedValue({ players: 3, phones: 4 })
    for (let n = 0; n < ANNOUNCEMENT_BROADCASTS_PER_DAY; n++) {
      db.rows.push({ announcementId: 100 + n, audience: 'ALL', createdAt: new Date(), status: 'SENT' })
    }
    expect(errorKeys(await send({ requestId: 'form-0003-abcd' }))).toContain('AnnouncementLimitReachedErrorType')
    // A test to one player is not a broadcast.
    expect((await send({ requestId: 'form-0004-abcd', audience: 'PLAYER', playerId: 9 })).successful).toBe(true)
  })
})

describe('sending a test to one player', () => {
  it('sends at once and the record already has the outcome', async () => {
    audienceReach.mockResolvedValue({ players: 1, phones: 2 })
    audiencePlayerIds.mockImplementation(async (sequelize, target, afterId) => (afterId === 0 ? [9] : []))
    SendPushService.execute.mockResolvedValue({ successful: true, result: { sent: 2 } })
    const done = await send({ audience: 'PLAYER', playerId: 9 })
    expect(done.result.announcement).toMatchObject({ status: 'SENT', sent: 2, targeted: 1, audience: 'PLAYER' })
  })

  it('records a player who can\'t be reached instead of failing', async () => {
    audienceReach.mockResolvedValue({ players: 0, phones: 0 })
    audiencePlayerIds.mockResolvedValue([])
    const done = await send({ audience: 'PLAYER', playerId: 9 })
    expect(done.successful).toBe(true)
    expect(done.result.announcement).toMatchObject({ status: 'SENT', sent: 0, targeted: 0 })
  })
})

describe('guards', () => {
  it('does nothing while push is not set up on the server', async () => {
    getFcmClient.mockReturnValue(null)
    expect(errorKeys(await send())).toContain('PushNotConfiguredErrorType')
    expect(db.rows).toHaveLength(0)
  })

  it('treats the same form sent twice as one announcement', async () => {
    await send()
    await settled(db)
    const again = await send()
    expect(again.result.replayed).toBe(true)
    expect(db.rows).toHaveLength(1)
    expect(SendPushService.execute).toHaveBeenCalledTimes(3)
  })

  it('needs text within the limits, and the days or player its audience needs', async () => {
    expect((await send({ title: '' })).successful).toBe(false)
    expect((await send({ title: 'x'.repeat(66) })).successful).toBe(false)
    expect((await send({ body: 'x'.repeat(179) })).successful).toBe(false)
    expect((await send({ audience: 'INACTIVE' })).successful).toBe(false)
    expect((await send({ audience: 'PLAYER' })).successful).toBe(false)
    expect((await send({ audience: 'EVERYONE' })).successful).toBe(false)
  })
})
