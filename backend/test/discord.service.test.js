import { SignInWithDiscordService } from '~/services/player'
import { JoinDiscordTableService } from '~/services/game'
import config from '~/configs/app.config'

jest.mock('~/libs/redisClient', () => {
  const store = new Map()
  return {
    __esModule: true,
    default: {
      publisherClient: { publish: jest.fn(), on: jest.fn() },
      subscriberClient: { on: jest.fn() },
      client: {
        get: jest.fn(async (key) => store.get(key) ?? null),
        set: jest.fn(async (key, value, ...rest) => {
          if (rest.includes('NX') && store.has(key)) return null
          store.set(key, value)
          return 'OK'
        }),
        del: jest.fn(async (key) => store.delete(key)),
        store
      }
    }
  }
})
jest.mock('~/services/game/createRoom.service', () => ({ CreateRoomService: { execute: jest.fn() } }))
jest.mock('~/services/game/joinRoom.service', () => ({ JoinRoomService: { execute: jest.fn() } }))
jest.mock('~/services/game/leaveRoom.service', () => ({ LeaveRoomService: { execute: jest.fn(async () => ({ successful: true })) } }))

// eslint-disable-next-line import/first
import redisClient from '~/libs/redisClient'
// eslint-disable-next-line import/first
import { CreateRoomService } from '~/services/game/createRoom.service'
// eslint-disable-next-line import/first
import { JoinRoomService } from '~/services/game/joinRoom.service'
// eslint-disable-next-line import/first
import { LeaveRoomService } from '~/services/game/leaveRoom.service'

const json = (body, ok = true) => ({ ok, json: async () => body })

describe('Discord login', () => {
  const realFetch = globalThis.fetch
  const settings = { 'auth.discordClientId': '123456', 'auth.discordClientSecret': 'shh' }
  let get

  beforeEach(() => {
    get = jest.spyOn(config, 'get').mockImplementation((key) => settings[key] ?? '')
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    get.mockRestore()
  })

  const verify = (code = 'c'.repeat(20)) => {
    const service = new SignInWithDiscordService({ code }, {})
    return service.verifyIdentity().then(identity => ({ identity, service }))
  }

  it('exchanges the code and names the player by their Discord id', async () => {
    globalThis.fetch = jest.fn()
      .mockResolvedValueOnce(json({ access_token: 'tok' }))
      .mockResolvedValueOnce(json({ id: '8001', username: 'sam', global_name: 'Sam P' }))

    const { identity } = await verify()

    expect(identity).toEqual({ ok: true, identity: { subject: '8001', email: null, name: 'Sam P' } })
    const [url, init] = globalThis.fetch.mock.calls[0]
    expect(url).toBe('https://discord.com/api/oauth2/token')
    expect(String(init.body)).toContain('client_secret=shh')
    expect(globalThis.fetch.mock.calls[1][1].headers.authorization).toBe('Bearer tok')
  })

  it('refuses a code Discord does not accept', async () => {
    globalThis.fetch = jest.fn().mockResolvedValueOnce(json({}, false))
    const { identity, service } = await verify()
    expect(identity).toBeUndefined()
    expect(Object.keys(service.errors.SignInWithDiscordService)).toEqual(['InvalidIdentityTokenErrorType'])
  })

  it('is off without the app id and secret', async () => {
    get.mockImplementation(() => '')
    globalThis.fetch = jest.fn()
    const { identity, service } = await verify()
    expect(identity).toBeUndefined()
    expect(Object.keys(service.errors.SignInWithDiscordService)).toEqual(['ProviderNotConfiguredErrorType'])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

describe('JoinDiscordTableService', () => {
  const table = (code, roomId = 1) => ({ successful: true, result: { room: { code, roomId } } })
  const join = (playerId, instanceId = 'inst-1') => JoinDiscordTableService.execute({ playerId, instanceId }, {})

  beforeEach(() => {
    jest.clearAllMocks()
    redisClient.client.store.clear()
  })

  it('opens a private table for the first player and remembers it', async () => {
    CreateRoomService.execute.mockResolvedValue(table('AB12CD'))
    const joined = await join(1)

    expect(joined.successful).toBe(true)
    expect(CreateRoomService.execute).toHaveBeenCalledWith(expect.objectContaining({ playerId: 1, mode: 'PRIVATE', bots: 0 }), {})
    expect(redisClient.client.store.get('roulette:discord:instance:inst-1')).toBe('AB12CD')
  })

  it('seats later players at the same table', async () => {
    redisClient.client.store.set('roulette:discord:instance:inst-1', 'AB12CD')
    JoinRoomService.execute.mockResolvedValue(table('AB12CD'))
    const joined = await join(2)

    expect(joined.result.room.code).toBe('AB12CD')
    expect(JoinRoomService.execute).toHaveBeenCalledWith({ playerId: 2, code: 'AB12CD' }, {})
    expect(CreateRoomService.execute).not.toHaveBeenCalled()
  })

  it('opens a new table when the remembered one has ended', async () => {
    redisClient.client.store.set('roulette:discord:instance:inst-1', 'OLD123')
    JoinRoomService.execute.mockResolvedValue({ successful: false, errors: { JoinRoomService: { RoomEndedErrorType: 'ended' } } })
    CreateRoomService.execute.mockResolvedValue(table('NEW456', 2))

    const joined = await join(3)

    expect(joined.result.room.code).toBe('NEW456')
    expect(redisClient.client.store.get('roulette:discord:instance:inst-1')).toBe('NEW456')
  })

  it('moves a player who lost the race to open the table over to the winner’s', async () => {
    CreateRoomService.execute.mockImplementation(async () => {
      // The other player records their table while this one is still being created.
      redisClient.client.store.set('roulette:discord:instance:inst-1', 'WIN111')
      return table('LOSE22', 9)
    })
    JoinRoomService.execute.mockResolvedValue(table('WIN111', 8))

    const joined = await join(4)

    expect(LeaveRoomService.execute).toHaveBeenCalledWith({ roomId: 9, playerId: 4 }, {})
    expect(joined.result.room.code).toBe('WIN111')
  })

  it('refuses an instance id with odd characters', async () => {
    const joined = await join(1, 'a/b c')
    expect(joined.successful).toBe(false)
  })
})
