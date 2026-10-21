import { onlinePlayerIds } from '~/libs/presence'
import redisClient from '~/libs/redisClient'
import { InviteFriendService, ListFriendsService, RemoveFriendService, RespondFriendRequestService, SendFriendRequestService } from '~/services/friend'
import { NotifyPlayerService } from '~/services/notification'
import { MAX_FRIENDS, MAX_PENDING_REQUESTS } from '~/utils/constants/friend.constants'

jest.mock('~/libs/presence', () => ({ onlinePlayerIds: jest.fn(), isOnline: jest.fn() }))
jest.mock('~/libs/redisClient', () => ({ __esModule: true, default: { client: { set: jest.fn() } } }))
jest.mock('~/services/notification', () => ({ NotifyPlayerService: { execute: jest.fn(async () => ({ successful: true, result: {} })) } }))

/** In-memory tables with the query shapes the friend services use. */
function fakeDb () {
  const rows = { Player: [], Friendship: [], Room: [], RoomPlayer: [] }
  const instance = (name, row) => {
    const copy = { ...row }
    Object.defineProperty(copy, 'update', { value: async (values) => Object.assign(copy, Object.assign(row, values)) })
    Object.defineProperty(copy, 'destroy', { value: async () => { rows[name].splice(rows[name].indexOf(row), 1) } })
    return copy
  }
  const matches = (row, where = {}) => {
    // Sequelize.where(lower(col), value), as sameIgnoringCase builds it.
    if (where.logic !== undefined) return row.username.toLowerCase() === where.logic
    return Object.entries(where).every(([key, value]) => (value === null ? row[key] == null : row[key] === value))
  }
  const table = (name, idKey, defaults = {}) => ({
    findOne: async ({ where }) => { const row = rows[name].find(r => matches(r, where)); return row ? instance(name, row) : null },
    findAll: async ({ where }) => rows[name].filter(r => matches(r, where)).map(row => instance(name, row)),
    findByPk: async (id) => { const row = rows[name].find(r => r[idKey] === id); return row ? instance(name, row) : null },
    count: async ({ where }) => rows[name].filter(r => matches(r, where)).length,
    create: async (values) => {
      if (name === 'Friendship' && rows.Friendship.some(r => [r.requesterId, r.addresseeId].sort().join() === [values.requesterId, values.addresseeId].sort().join())) {
        throw Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' })
      }
      const row = { [idKey]: rows[name].length + 1, ...defaults, ...values }
      rows[name].push(row)
      return instance(name, row)
    }
  })
  return {
    rows,
    addPlayer: (username, extra = {}) => { const row = { playerId: rows.Player.length + 1, username, status: 'active', ...extra }; rows.Player.push(row); return row },
    befriend: (a, b, status = 'ACCEPTED', requesterId = a.playerId) => {
      const row = { friendshipId: rows.Friendship.length + 1, requesterId, addresseeId: requesterId === a.playerId ? b.playerId : a.playerId, status }
      rows.Friendship.push(row)
      return row
    },
    context: {
      dbModels: { Player: table('Player', 'playerId'), Friendship: table('Friendship', 'friendshipId'), Room: table('Room', 'roomId'), RoomPlayer: table('RoomPlayer', 'roomPlayerId') },
      sequelize: { transaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }), query: jest.fn() },
      logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn() }
    }
  }
}

const errorKeys = (service) => Object.values(service.errors).flatMap(errors => Array.isArray(errors) ? errors : Object.keys(errors))
const errorsOf = (result) => Object.values(result.errors).flatMap(group => Object.entries(group).map(([key, text]) => `${key} ${text}`)).join(' | ')

let db
let ana
let bo
beforeEach(() => {
  jest.clearAllMocks()
  db = fakeDb()
  ana = db.addPlayer('ana')
  bo = db.addPlayer('Bo_Smith')
  redisClient.client.set.mockResolvedValue('OK')
  onlinePlayerIds.mockResolvedValue(new Set())
})

const ask = (playerId, username) => SendFriendRequestService.execute({ playerId, username }, db.context)
const notices = () => NotifyPlayerService.execute.mock.calls.map(([args]) => [args.playerId, args.event.name, args.push.type])

describe('asking someone to be friends', () => {
  it('finds them by username however it is typed, and tells them', async () => {
    const result = await ask(ana.playerId, 'bo_smith')
    expect(result.successful).toBe(true)
    expect(result.result).toMatchObject({ status: 'PENDING', friend: { playerId: bo.playerId, username: 'Bo_Smith' } })
    expect(db.rows.Friendship).toEqual([expect.objectContaining({ requesterId: ana.playerId, addresseeId: bo.playerId, status: 'PENDING' })])
    expect(notices()).toEqual([[bo.playerId, 'friend:request', 'friendRequest']])
    expect(NotifyPlayerService.execute.mock.calls[0][0].event.payload).toEqual({ from: { playerId: ana.playerId, username: 'ana' } })
  })

  it('turns down yourself, a name nobody has, a banned player, and someone already a friend', async () => {
    const banned = db.addPlayer('banned_guy', { status: 'banned' })
    expect(errorKeys(await ask(ana.playerId, 'ANA'))).toContain('FriendRequestNotAllowedErrorType')
    expect(errorKeys(await ask(ana.playerId, 'nobody_here'))).toContain('PlayerNameNotFoundErrorType')
    expect(errorKeys(await ask(ana.playerId, banned.username))).toContain('PlayerNameNotFoundErrorType')
    db.befriend(ana, bo)
    expect(errorsOf(await ask(ana.playerId, 'Bo_Smith'))).toContain('AlreadyFriends')
    expect(NotifyPlayerService.execute).not.toHaveBeenCalled()
  })

  it('is harmless to ask twice: one request, one notification', async () => {
    await ask(ana.playerId, 'Bo_Smith')
    const again = await ask(ana.playerId, 'Bo_Smith')
    expect(again.successful).toBe(true)
    expect(db.rows.Friendship).toHaveLength(1)
    expect(NotifyPlayerService.execute).toHaveBeenCalledTimes(1)
  })

  it('counts as a yes when they had already asked you', async () => {
    db.befriend(bo, ana, 'PENDING', bo.playerId)
    const result = await ask(ana.playerId, 'Bo_Smith')
    expect(result.result.status).toBe('ACCEPTED')
    expect(db.rows.Friendship).toEqual([expect.objectContaining({ status: 'ACCEPTED' })])
    expect(notices()).toEqual([[bo.playerId, 'friend:accepted', 'friendAccepted']])
  })

  it('says nothing to someone who declined, and nothing back about it', async () => {
    db.befriend(ana, bo, 'DECLINED', ana.playerId)
    const result = await ask(ana.playerId, 'Bo_Smith')
    expect(result.successful).toBe(true)
    expect(result.result.status).toBe('PENDING')
    expect(NotifyPlayerService.execute).not.toHaveBeenCalled()
    expect(db.rows.Friendship[0].status).toBe('DECLINED')
  })

  it('lets someone ask a player they declined earlier', async () => {
    db.befriend(ana, bo, 'DECLINED', bo.playerId) // bo asked, and ana declined
    const result = await ask(ana.playerId, 'Bo_Smith')
    expect(result.result.status).toBe('PENDING')
    expect(db.rows.Friendship).toEqual([expect.objectContaining({ requesterId: ana.playerId, addresseeId: bo.playerId, status: 'PENDING' })])
  })

  it('stops at the limits for pending requests and friends', async () => {
    for (let n = 0; n < MAX_PENDING_REQUESTS; n++) db.befriend(ana, db.addPlayer(`other_${n}`), 'PENDING')
    expect(errorsOf(await ask(ana.playerId, 'Bo_Smith'))).toContain('TooManyPending')

    const full = db.addPlayer('popular')
    for (let n = 0; n < MAX_FRIENDS; n++) db.befriend(full, db.addPlayer(`pal_${n}`))
    const newcomer = db.addPlayer('newcomer')
    expect(errorsOf(await ask(newcomer.playerId, 'popular'))).toContain('TheyHaveTooMany')
    expect(errorsOf(await ask(full.playerId, 'newcomer'))).toContain('YouHaveTooMany')
  })

  it('treats the same request arriving twice at once as one', async () => {
    const [first, second] = await Promise.all([ask(ana.playerId, 'Bo_Smith'), ask(ana.playerId, 'Bo_Smith')])
    expect([first.successful, second.successful]).toEqual([true, true])
    expect(db.rows.Friendship).toHaveLength(1)
  })
})

describe('answering a request', () => {
  const respond = (playerId, friendshipId, accept) => RespondFriendRequestService.execute({ playerId, friendshipId, accept }, db.context)

  it('accepts, and tells whoever asked', async () => {
    const request = db.befriend(ana, bo, 'PENDING', ana.playerId)
    const done = await respond(bo.playerId, request.friendshipId, true)
    expect(done.result).toMatchObject({ status: 'ACCEPTED', friend: { playerId: ana.playerId, username: 'ana' } })
    expect(notices()).toEqual([[ana.playerId, 'friend:accepted', 'friendAccepted']])
  })

  it('declines quietly and keeps the record', async () => {
    const request = db.befriend(ana, bo, 'PENDING', ana.playerId)
    expect((await respond(bo.playerId, request.friendshipId, false)).result.status).toBe('DECLINED')
    expect(NotifyPlayerService.execute).not.toHaveBeenCalled()
    expect(db.rows.Friendship).toHaveLength(1)
  })

  it('only lets the person asked answer, once', async () => {
    const request = db.befriend(ana, bo, 'PENDING', ana.playerId)
    expect(errorKeys(await respond(ana.playerId, request.friendshipId, true))).toContain('FriendRequestNotFoundErrorType')
    await respond(bo.playerId, request.friendshipId, true)
    expect(errorKeys(await respond(bo.playerId, request.friendshipId, true))).toContain('FriendRequestNotFoundErrorType')
  })
})

describe('removing a friend', () => {
  const remove = (playerId, friendPlayerId) => RemoveFriendService.execute({ playerId, friendPlayerId }, db.context)

  it('ends a friendship from either side, saying nothing', async () => {
    db.befriend(ana, bo)
    expect((await remove(bo.playerId, ana.playerId)).successful).toBe(true)
    expect(db.rows.Friendship).toHaveLength(0)
    expect(NotifyPlayerService.execute).not.toHaveBeenCalled()
  })

  it('takes back a request you sent, but not one you were sent or one that was declined', async () => {
    db.befriend(ana, bo, 'PENDING', ana.playerId)
    expect(errorKeys(await remove(bo.playerId, ana.playerId))).toContain('FriendNotFoundErrorType')
    expect((await remove(ana.playerId, bo.playerId)).successful).toBe(true)

    db.befriend(ana, bo, 'DECLINED', ana.playerId)
    expect(errorKeys(await remove(ana.playerId, bo.playerId))).toContain('FriendNotFoundErrorType')
    expect(db.rows.Friendship).toHaveLength(1)
  })
})

describe('inviting a friend to a table', () => {
  let room
  const invite = (code = 'AB12CD', friend = bo) => InviteFriendService.execute({ playerId: ana.playerId, friendPlayerId: friend.playerId, code }, db.context)
  const sit = (player, roomId = room.roomId) => db.rows.RoomPlayer.push({ roomPlayerId: db.rows.RoomPlayer.length + 1, roomId, playerId: player.playerId, leftAt: null })

  beforeEach(() => {
    db.befriend(ana, bo)
    room = { roomId: 1, code: 'AB12CD', status: 'OPEN', mode: 'PRIVATE', variant: 'ENGLISH', maxSeats: 3 }
    db.rows.Room.push(room)
    sit(ana)
  })

  it('tells the friend which table, live or on their phone', async () => {
    expect((await invite()).successful).toBe(true)
    const [args] = NotifyPlayerService.execute.mock.calls[0]
    expect(args.playerId).toBe(bo.playerId)
    expect(args.event).toEqual({ name: 'friend:invited', payload: { from: { playerId: ana.playerId, username: 'ana' }, code: 'AB12CD', variant: 'ENGLISH', mode: 'PRIVATE' } })
    expect(args.push).toMatchObject({ category: 'friends', type: 'friendInvite', data: { screen: 'join', code: 'AB12CD' } })
  })

  it('needs a friend, a seat at that table, and a real table', async () => {
    const stranger = db.addPlayer('stranger')
    expect(errorKeys(await invite('AB12CD', stranger))).toContain('FriendNotFoundErrorType')
    expect(errorsOf(await invite('ZZZZZZ'))).toContain('NotAtThatTable')
    room.mode = 'VS_COMPUTER'
    expect(errorsOf(await invite())).toContain('NotAtThatTable')
    room.mode = 'PRIVATE'
    room.status = 'ENDED'
    expect(errorsOf(await invite())).toContain('NotAtThatTable')
    expect(NotifyPlayerService.execute).not.toHaveBeenCalled()
  })

  it('does not invite someone already there, or into a full table', async () => {
    sit(bo)
    expect(errorsOf(await invite())).toContain('AlreadyThere')
    db.rows.RoomPlayer.pop()
    sit(db.addPlayer('c')); sit(db.addPlayer('d'))
    expect(errorsOf(await invite())).toContain('TableFull')
  })

  it('invites a friend once a minute', async () => {
    redisClient.client.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null)
    expect((await invite()).successful).toBe(true)
    expect(errorsOf(await invite())).toContain('TooSoon')
    expect(redisClient.client.set).toHaveBeenCalledWith(`friendInvite:${ana.playerId}:${bo.playerId}`, '1', 'EX', 60, 'NX')
  })
})

describe('the friends list', () => {
  const friendRow = (playerId, username, extra = {}) => ({ playerId, username, since: '2026-10-01', lastSeenAt: null, tableCode: null, ...extra })

  it('puts online friends first and shows their table only while they are connected', async () => {
    db.context.sequelize.query
      .mockResolvedValueOnce([
        friendRow(7, 'zed', { tableCode: 'AB12CD', tableVariant: 'ENGLISH', tableMode: 'PRIVATE', tableSeated: 2, tableMaxSeats: 8 }),
        friendRow(8, 'amy', { tableCode: 'XY99ZZ', tableVariant: 'AMERICAN', tableMode: 'PUBLIC', tableSeated: 8, tableMaxSeats: 8 }),
        friendRow(9, 'bea')
      ])
      .mockResolvedValueOnce([
        { friendshipId: 1, playerId: 3, username: 'cal', sentAt: '2026-10-19', incoming: true },
        { friendshipId: 2, playerId: 4, username: 'dee', sentAt: '2026-10-18', incoming: false }
      ])
    onlinePlayerIds.mockResolvedValue(new Set([7, 9]))

    const { result } = await ListFriendsService.execute({ playerId: ana.playerId }, db.context)
    expect(result.friends.map(friend => [friend.username, friend.online, friend.table?.code ?? null])).toEqual([
      ['bea', true, null], ['zed', true, 'AB12CD'], ['amy', false, null]
    ])
    expect(result.friends.find(friend => friend.username === 'zed').table).toMatchObject({ seated: 2, maxSeats: 8, hasRoom: true })
    expect(result.incoming).toEqual([{ friendshipId: 1, playerId: 3, username: 'cal', sentAt: '2026-10-19' }])
    expect(result.outgoing).toEqual([{ friendshipId: 2, playerId: 4, username: 'dee', sentAt: '2026-10-18' }])
  })
})
