import { LinkProviderService, SignInWithProviderService } from '~/services/player'
import { identityVerifier } from '~/utils/identityToken.utils'

// The token check itself is covered in identityToken.utils.test.js; here the
// verifier answers with whatever identity a test sets.
jest.mock('~/utils/identityToken.utils', () => ({ identityVerifier: jest.fn() }))
jest.mock('~/services/player/startSession.service', () => ({
  StartSessionService: { execute: jest.fn(async ({ playerId }) => ({ successful: true, result: { tokens: { accessToken: `a${playerId}`, refreshToken: `r${playerId}` } } })) }
}))
jest.mock('~/services/referral', () => ({ QualifyReferralsService: { execute: jest.fn(async () => ({ successful: true, result: { rewarded: [] } })) } }))
jest.mock('~/services/player/createPlayer.service', () => ({ CreatePlayerService: { execute: jest.fn() } }))

// eslint-disable-next-line import/first
import { CreatePlayerService } from '~/services/player/createPlayer.service'

/** Minimal in-memory tables with the query shapes the services use. */
function fakeDb () {
  const rows = { Player: [], PlayerIdentity: [], Wallet: [] }
  // Like a Sequelize instance, update() changes the stored row and this copy.
  const instance = (row) => {
    const copy = { ...row }
    Object.defineProperty(copy, 'update', { value: async (values) => Object.assign(copy, Object.assign(row, values)) })
    return copy
  }
  const matches = (row, where) => {
    // Sequelize.where(lower(col), value), as sameIgnoringCase builds it.
    if (where.logic !== undefined) return row.username.toLowerCase() === where.logic
    return Object.entries(where).every(([key, value]) => row[key] === value)
  }
  const table = (name, idKey) => ({
    findOne: async ({ where }) => { const row = rows[name].find(r => matches(r, where)); return row ? instance(row) : null },
    findAll: async ({ where }) => rows[name].filter(r => matches(r, where)).map(instance),
    findByPk: async (id) => { const row = rows[name].find(r => r[idKey] === id); return row ? instance(row) : null },
    create: async (values) => { const row = { [idKey]: rows[name].length + 1, ...values }; rows[name].push(row); return instance(row) }
  })
  return {
    rows,
    context: {
      dbModels: { Player: table('Player', 'playerId'), PlayerIdentity: table('PlayerIdentity', 'playerIdentityId'), Wallet: table('Wallet', 'walletId') },
      sequelize: { transaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }) }
    }
  }
}

const errorKeys = (service) => Object.values(service.errors).flatMap(errors => Array.isArray(errors) ? errors : Object.keys(errors))

describe('signing in with Google or Apple', () => {
  let db
  let identity
  const signIn = (args = {}) => SignInWithProviderService.execute({ provider: 'google', idToken: 'x'.repeat(40), ...args }, db.context)

  beforeEach(() => {
    db = fakeDb()
    identity = { subject: 'google-sub-1', email: 'ana@example.com', name: 'Ana López' }
    identityVerifier.mockReturnValue(async () => ({ ok: true, identity }))
    CreatePlayerService.execute.mockImplementation(async ({ username, isGuest }) => {
      if (db.rows.Player.some(p => p.username === username)) return { successful: false, errors: { CreatePlayerService: { UsernameTakenErrorType: 'taken' } } }
      const player = await db.context.dbModels.Player.create({ username, isGuest, status: 'active', tokenVersion: 0 })
      await db.context.dbModels.Wallet.create({ playerId: player.playerId, balance: 1000, lockedBalance: 0, currency: 'CHIP', version: 1 })
      return { successful: true, result: { player: { playerId: player.playerId } } }
    })
  })

  it('creates a player the first time, named after the account', async () => {
    const first = await signIn()
    expect(first.successful).toBe(true)
    expect(first.result).toMatchObject({ isNew: true, wallet: { balance: 1000 }, tokens: { accessToken: 'a1' } })
    expect(first.result.player).toMatchObject({ isGuest: false, email: 'ana@example.com', providers: ['google'] })
    expect(first.result.player.username).toMatch(/^ana_lopez_[a-z2-9]{4}$/)
    expect(db.rows.PlayerIdentity).toEqual([expect.objectContaining({ playerId: 1, provider: 'google', subject: 'google-sub-1' })])
  })

  it('signs in as the same player afterwards', async () => {
    await signIn()
    const again = await signIn()
    expect(again.result).toMatchObject({ isNew: false, player: { playerId: 1 } })
    expect(db.rows.Player).toHaveLength(1)
  })

  it('keys accounts on the provider id, not the email', async () => {
    await signIn()
    identity = { ...identity, subject: 'google-sub-2' }
    expect((await signIn()).result.player.playerId).toBe(2)
  })

  it('tries another name if one is taken', async () => {
    CreatePlayerService.execute.mockResolvedValueOnce({ successful: false, errors: { CreatePlayerService: { UsernameTakenErrorType: 'taken' } } })
    expect((await signIn()).successful).toBe(true)
  })

  it('turns away banned players', async () => {
    await signIn()
    db.rows.Player[0].status = 'banned'
    expect(errorKeys(await signIn())).toEqual(['PlayerBannedErrorType'])
  })

  it('reports an unverifiable token or an unconfigured provider', async () => {
    identityVerifier.mockReturnValue(async () => ({ ok: false, reason: 'Expired' }))
    expect(errorKeys(await signIn())).toEqual(['InvalidIdentityTokenErrorType'])
    identityVerifier.mockReturnValue(null)
    expect(errorKeys(await signIn({ provider: 'apple' }))).toEqual(['ProviderNotConfiguredErrorType'])
  })
})

describe('linking an account', () => {
  let db
  let identity
  const link = (playerId, args = {}) => LinkProviderService.execute({ playerId, provider: 'apple', idToken: 'x'.repeat(40), ...args }, db.context)

  beforeEach(async () => {
    db = fakeDb()
    identity = { subject: 'apple-sub-1', email: 'relay@privaterelay.appleid.com', name: null }
    identityVerifier.mockReturnValue(async () => ({ ok: true, identity }))
    await db.context.dbModels.Player.create({ username: 'guest_abcd2345', isGuest: true, status: 'active', tokenVersion: 0 })
    await db.context.dbModels.Player.create({ username: 'ben_x1y2', isGuest: false, status: 'active', tokenVersion: 0 })
  })

  it("saves a guest: same player, renamed from the account's name", async () => {
    const linked = await link(1, { name: 'Ana Smith' })
    expect(linked.result.player).toMatchObject({ playerId: 1, isGuest: false, providers: ['apple'] })
    expect(linked.result.player.username).toMatch(/^ana_smith_/)
  })

  it('refuses an account that already belongs to another player', async () => {
    await link(2)
    expect(errorKeys(await link(1))).toEqual(['IdentityInUseErrorType'])
    expect(db.rows.Player[0].isGuest).toBe(true)
  })

  it('allows one account per provider, and relinking the same one is harmless', async () => {
    await link(2)
    expect((await link(2)).successful).toBe(true)
    identity = { ...identity, subject: 'apple-sub-2' }
    expect(errorKeys(await link(2))).toEqual(['IdentityInUseErrorType'])
    expect(db.rows.PlayerIdentity).toHaveLength(1)
  })
})
