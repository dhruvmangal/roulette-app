import request from 'supertest'
import '~/json-schemas'
import { signAccessToken, signRefreshToken } from '~/utils/auth.utils'

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
  const Player = { findByPk: jest.fn(), findOne: jest.fn(), scope: jest.fn() }
  Player.scope.mockReturnValue(Player)
  const Wallet = { findOne: jest.fn() }
  return {
    __esModule: true,
    default: { Player, Wallet },
    sequelize: { transaction: jest.fn(), query: jest.fn() }
  }
})

// eslint-disable-next-line import/first
import models, { sequelize } from '~/db/models'
// eslint-disable-next-line import/first
import app from '~/rest-resources'

const { Player, Wallet } = models
const ana = { playerId: 7, username: 'ana', isGuest: false, status: 'active', tokenVersion: 0 }
const accessToken = ({ playerId, tokenVersion }) => signAccessToken({ playerId, tokenVersion, type: 'access' })
const refreshToken = ({ playerId, tokenVersion }) => signRefreshToken({ playerId, tokenVersion, type: 'refresh', sid: 'x' })
const bearer = (player) => `Bearer ${accessToken(player)}`

beforeEach(() => jest.clearAllMocks())

describe('signing in', () => {
  it('no longer accepts passwords', async () => {
    expect((await request(app).post('/api/v1/auth/sign-up').send({ username: 'ana', password: 'whatever1' })).status).toBe(404)
    expect((await request(app).post('/api/v1/auth/login').send({ login: 'ana', password: 'whatever1' })).status).toBe(404)
  })

  it('needs an ID token from Google or Apple, and only those two', async () => {
    const res = await request(app).post('/api/v1/auth/google').send({})
    expect(res.status).toBe(400)
    expect(res.body.errors[0].errorCode).toBe(1001)
    expect((await request(app).post('/api/v1/auth/facebook').send({ idToken: 'x'.repeat(40) })).status).toBe(404)
  })

  it('tells apps which providers are on, with their public client IDs', async () => {
    const res = await request(app).get('/api/v1/auth/providers')
    expect(res.status).toBe(200)
    expect(res.body.data.providers).toEqual({ google: null, apple: null, discord: null })
  })

  it('says so when a provider has no client IDs configured', async () => {
    const res = await request(app).post('/api/v1/auth/apple').send({ idToken: 'x'.repeat(40) })
    expect(res.status).toBe(503)
    expect(res.body.errors[0].errorCode).toBe(1208)
  })
})

describe('POST /api/v1/auth/refresh', () => {
  it('will not accept an access token as a refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: accessToken(ana) })

    expect(res.status).toBe(401)
    expect(res.body.errors[0].errorCode).toBe(1205)
  })
})

describe('authenticated routes', () => {
  it('require a token', async () => {
    const res = await request(app).get('/api/v1/wallet')

    expect(res.status).toBe(403)
    expect(res.body.errors[0].errorCode).toBe(1007)
  })

  it('serve the signed-in player', async () => {
    Player.findByPk.mockResolvedValue(ana)
    Wallet.findOne.mockResolvedValue({ walletId: 3, playerId: 7, balance: 1000, lockedBalance: 0, currency: 'CHIP', version: 1 })
    const res = await request(app).get('/api/v1/wallet').set('Authorization', bearer(ana))

    expect(res.status).toBe(200)
    expect(res.body.data.wallet.balance).toBe(1000)
    expect(Wallet.findOne).toHaveBeenCalledWith({ where: { playerId: 7 } })
  })

  it('turn away banned players and revoked tokens', async () => {
    Player.findByPk.mockResolvedValue({ ...ana, status: 'banned' })
    expect((await request(app).get('/api/v1/wallet').set('Authorization', bearer(ana))).status).toBe(403)

    Player.findByPk.mockResolvedValue({ ...ana, tokenVersion: 1 })
    expect((await request(app).get('/api/v1/wallet').set('Authorization', bearer(ana))).status).toBe(403)
  })

  it('do not accept a refresh token as an access token', async () => {
    Player.findByPk.mockResolvedValue(ana)
    const res = await request(app).get('/api/v1/wallet').set('Authorization', `Bearer ${refreshToken(ana)}`)

    expect(res.status).toBe(403)
  })
})

describe('GET /api/v1/players/leaderboard', () => {
  it('ranks by net winnings and includes the player even outside the top', async () => {
    Player.findByPk.mockResolvedValue(ana)
    sequelize.query.mockResolvedValue([
      { rank: 1, playerId: 9, username: 'cy', net: 500, rounds: 3, biggestWin: 350 },
      { rank: 60, playerId: 7, username: 'ana', net: -40, rounds: 2, biggestWin: 0 }
    ])
    const res = await request(app).get('/api/v1/players/leaderboard?period=day').set('Authorization', bearer(ana))

    expect(res.status).toBe(200)
    expect(res.body.data.entries.map(row => row.username)).toEqual(['cy'])
    expect(res.body.data.me).toMatchObject({ rank: 60, net: -40 })
    expect(sequelize.query.mock.calls[0][1].replacements).toMatchObject({ since: '1 day', playerId: 7 })
  })

  it('only knows day, week and all', async () => {
    Player.findByPk.mockResolvedValue(ana)
    expect((await request(app).get('/api/v1/players/leaderboard?period=year').set('Authorization', bearer(ana))).status).toBe(400)
  })
})
