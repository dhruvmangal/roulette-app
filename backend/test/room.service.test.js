import { LeaveRoomService, StartRoomService } from '~/services/game'

jest.mock('~/libs/redisClient', () => ({
  __esModule: true,
  default: { publisherClient: { publish: jest.fn(), on: jest.fn() }, client: {}, subscriberClient: { on: jest.fn() } }
}))
jest.mock('~/socket-resources/emitters/roulette.emitter', () => ({
  __esModule: true,
  default: { roomUpdated: jest.fn(), playerLeft: jest.fn(), betsRemoved: jest.fn(), walletUpdated: jest.fn(), roomEnded: jest.fn() }
}))

// eslint-disable-next-line import/first
import redisClient from '~/libs/redisClient'
// eslint-disable-next-line import/first
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'

const errorKeys = (service) => Object.values(service.errors).flatMap(errors => Object.keys(errors))

/** A room row whose update() changes it in place, as a Sequelize instance does. */
const roomRow = (values) => {
  const row = { roomId: 7, code: 'AB12CD', variant: 'ENGLISH', mode: 'PRIVATE', maxSeats: 8, minBet: 1, maxBet: 5000, bettingSeconds: 20, totalRounds: null, ...values }
  row.update = jest.fn(async (changes) => Object.assign(row, changes))
  return row
}

const contextFor = (room, models = {}) => ({
  dbModels: { Room: { findByPk: jest.fn(async () => room) }, ...models },
  sequelize: { transaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } }) }
})

beforeEach(() => jest.clearAllMocks())

describe('StartRoomService', () => {
  it('lets the host open a waiting table and wakes it', async () => {
    const room = roomRow({ status: 'WAITING', hostPlayerId: 1 })
    const started = await StartRoomService.execute({ roomId: 7, playerId: 1 }, contextFor(room))

    expect(started.successful).toBe(true)
    expect(room.status).toBe('OPEN')
    expect(RouletteEmitter.roomUpdated).toHaveBeenCalledWith(7, expect.objectContaining({ status: 'OPEN' }))
    expect(redisClient.publisherClient.publish).toHaveBeenCalled()
  })

  it('refuses anyone but the host', async () => {
    const room = roomRow({ status: 'WAITING', hostPlayerId: 1 })
    const started = await StartRoomService.execute({ roomId: 7, playerId: 2 }, contextFor(room))

    expect(errorKeys(started)).toEqual(['NotRoomHostErrorType'])
    expect(room.status).toBe('WAITING')
  })

  it('does nothing for a table that already started', async () => {
    const room = roomRow({ status: 'OPEN', hostPlayerId: 1 })
    const started = await StartRoomService.execute({ roomId: 7, playerId: 1 }, contextFor(room))

    expect(started.successful).toBe(true)
    expect(room.update).not.toHaveBeenCalled()
    expect(RouletteEmitter.roomUpdated).not.toHaveBeenCalled()
  })
})

describe('LeaveRoomService', () => {
  it('hands the host role to the longest-seated player', async () => {
    const room = roomRow({ status: 'WAITING', hostPlayerId: 1 })
    const seat = { roomPlayerId: 11, seat: 1, update: jest.fn() }
    const RoomPlayer = {
      findOne: jest.fn(async () => seat),
      findAll: jest.fn(async () => [{ playerId: 2 }, { playerId: 3 }])
    }
    const Round = { findOne: jest.fn(async () => null) }
    const left = await LeaveRoomService.execute({ roomId: 7, playerId: 1 }, contextFor(room, { RoomPlayer, Round, Bet: {} }))

    expect(left.successful).toBe(true)
    expect(room.hostPlayerId).toBe(2)
    expect(RouletteEmitter.roomUpdated).toHaveBeenCalledWith(7, expect.objectContaining({ hostPlayerId: 2 }))
  })
})
