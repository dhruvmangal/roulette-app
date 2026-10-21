import { SendChatMessageService, SetShareBetsService } from '~/services/game'

jest.mock('~/libs/redisClient', () => ({
  __esModule: true,
  default: { publisherClient: { publish: jest.fn(), on: jest.fn() }, client: { incr: jest.fn(async () => 1), expire: jest.fn() }, subscriberClient: { on: jest.fn() } }
}))
jest.mock('~/socket-resources/emitters/roulette.emitter', () => ({
  __esModule: true,
  default: { chatMessage: jest.fn() }
}))

// eslint-disable-next-line import/first
import redisClient from '~/libs/redisClient'
// eslint-disable-next-line import/first
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'

const seat = { roomPlayerId: 4, seat: 2, shareBets: true, update: jest.fn(async function (changes) { Object.assign(this, changes) }) }

const contextFor = () => ({
  dbModels: {
    ChatMessage: { create: jest.fn(async (values) => ({ chatMessageId: 9, createdAt: new Date('2026-10-21T10:00:00Z'), ...values })) },
    Player: { findByPk: jest.fn(async () => ({ username: 'sam' })) },
    Room: { findByPk: jest.fn(async () => ({ roomId: 7, status: 'OPEN', code: 'AB12CD' })) },
    RoomPlayer: { findOne: jest.fn(async () => seat) }
  }
})

beforeEach(() => {
  jest.clearAllMocks()
  seat.shareBets = true
  redisClient.client.incr.mockResolvedValue(1)
})

describe('SendChatMessageService reactions', () => {
  it('posts a known reaction as its id, without the word filter', async () => {
    const context = contextFor()
    const sent = await SendChatMessageService.execute({ playerId: 1, roomId: 7, reaction: 'jackpot' }, context)

    expect(sent.successful).toBe(true)
    expect(context.dbModels.ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({ text: 'jackpot', kind: 'REACTION' }))
    expect(RouletteEmitter.chatMessage).toHaveBeenCalledWith(7, expect.objectContaining({ kind: 'REACTION', text: 'jackpot', name: 'sam', seat: 2 }))
  })

  it('refuses a reaction that is not in the set', async () => {
    const sent = await SendChatMessageService.execute({ playerId: 1, roomId: 7, reaction: 'rude' }, contextFor())
    expect(sent.successful).toBe(false)
  })

  it('refuses a request with neither text nor reaction', async () => {
    const sent = await SendChatMessageService.execute({ playerId: 1, roomId: 7 }, contextFor())
    expect(sent.successful).toBe(false)
  })

  it('counts reactions toward the rate limit', async () => {
    redisClient.client.incr.mockResolvedValue(6)
    const context = contextFor()
    const sent = await SendChatMessageService.execute({ playerId: 1, roomId: 7, reaction: 'win' }, context)

    expect(sent.successful).toBe(false)
    expect(context.dbModels.ChatMessage.create).not.toHaveBeenCalled()
  })

  it('still posts typed text as TEXT', async () => {
    const context = contextFor()
    await SendChatMessageService.execute({ playerId: 1, roomId: 7, text: ' gg  all ' }, context)
    expect(context.dbModels.ChatMessage.create).toHaveBeenCalledWith(expect.objectContaining({ text: 'gg all', kind: 'TEXT' }))
  })
})

describe('SetShareBetsService', () => {
  it('turns sharing off and on for the seat', async () => {
    const off = await SetShareBetsService.execute({ playerId: 1, roomId: 7, share: false }, contextFor())
    expect(off.successful).toBe(true)
    expect(seat.shareBets).toBe(false)

    await SetShareBetsService.execute({ playerId: 1, roomId: 7, share: true }, contextFor())
    expect(seat.shareBets).toBe(true)
  })
})
