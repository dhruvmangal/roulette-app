import { Op } from 'sequelize'
import { ClaimReferralService, QualifyReferralsService } from '~/services/referral'
import { roundsPlayedBy, shareADevice } from '~/utils/referral.utils'
import { ApplyWalletTransactionService } from '~/services/wallet'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { REFERRAL_MAX_REWARDED, REFERRAL_REWARDS, REFERRAL_ROUNDS_REQUIRED } from '~/utils/constants/referral.constants'

// The SQL helpers are stubbed: a test sets how many rounds each player has and whether two share a device.
jest.mock('~/utils/referral.utils', () => ({
  ...jest.requireActual('~/utils/referral.utils'),
  roundsPlayedBy: jest.fn(),
  shareADevice: jest.fn()
}))
jest.mock('~/services/wallet', () => ({ ApplyWalletTransactionService: { execute: jest.fn() } }))
jest.mock('~/socket-resources/emitters/roulette.emitter', () => ({ __esModule: true, default: { walletUpdated: jest.fn() } }))

const DAY = 24 * 60 * 60 * 1000

/** Minimal in-memory tables with the query shapes the referral services use. */
function fakeDb () {
  const rows = { Player: [], Referral: [] }
  const instance = (row) => {
    const copy = { ...row }
    Object.defineProperty(copy, 'update', { value: async (values) => Object.assign(copy, Object.assign(row, values)) })
    return copy
  }
  const test = (value, condition) => {
    if (condition && typeof condition === 'object' && !(condition instanceof Date) && !Array.isArray(condition)) {
      if (Op.in in condition) return condition[Op.in].includes(value)
      if (Op.gt in condition) return value > condition[Op.gt]
    }
    return Array.isArray(condition) ? condition.includes(value) : value === condition
  }
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => test(row[key], value))
  const table = (name, idKey, defaults = {}) => ({
    findOne: async ({ where }) => { const row = rows[name].find(r => matches(r, where)); return row ? instance(row) : null },
    findAll: async ({ where }) => rows[name].filter(r => matches(r, where)).map(instance),
    findByPk: async (id) => { const row = rows[name].find(r => r[idKey] === id); return row ? instance(row) : null },
    count: async ({ where }) => rows[name].filter(r => matches(r, where)).length,
    create: async (values) => {
      if (name === 'Referral' && rows.Referral.some(r => r.refereeId === values.refereeId)) throw Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' })
      const row = { [idKey]: rows[name].length + 1, ...defaults, ...values }
      rows[name].push(row)
      return instance(row)
    }
  })
  return {
    rows,
    addPlayer: (values) => { const row = { playerId: rows.Player.length + 1, isGuest: false, status: 'active', referralCode: null, createdAt: new Date(), ...values }; rows.Player.push(row); return row },
    context: {
      dbModels: { Player: table('Player', 'playerId'), Referral: table('Referral', 'referralId', { status: 'PENDING', referrerReward: 0, refereeReward: 0 }) },
      sequelize: { transaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }) }
    }
  }
}

const errorKeys = (service) => Object.values(service.errors).flatMap(errors => Array.isArray(errors) ? errors : Object.keys(errors))

let db
let rounds
beforeEach(() => {
  jest.clearAllMocks()
  db = fakeDb()
  rounds = {}
  roundsPlayedBy.mockImplementation(async (sequelize, ids) => Object.fromEntries(ids.map(id => [id, rounds[id] ?? 0])))
  shareADevice.mockResolvedValue(false)
  ApplyWalletTransactionService.execute.mockImplementation(async ({ playerId, amount }) => ({ successful: true, result: { wallet: { playerId, credited: amount } } }))
})

describe('claiming a friend\'s code', () => {
  const claim = (playerId, code) => ClaimReferralService.execute({ playerId, code }, db.context)

  it('links a new player to the friend, accepting the code typed loosely', async () => {
    const friend = db.addPlayer({ username: 'ana', referralCode: 'K7QM2XA' })
    const me = db.addPlayer({ username: 'guest_x', isGuest: true })
    const result = await claim(me.playerId, 'k7qm-2xa ')
    expect(result.successful).toBe(true)
    expect(db.rows.Referral).toEqual([expect.objectContaining({ referrerId: friend.playerId, refereeId: me.playerId, code: 'K7QM2XA', status: 'PENDING' })])
    // A guest with no rounds doesn't qualify yet.
    expect(ApplyWalletTransactionService.execute).not.toHaveBeenCalled()
  })

  it('turns down unknown codes, your own code, a second code, a late code and a loop', async () => {
    const ana = db.addPlayer({ username: 'ana', referralCode: 'AAAAAAA' })
    const bo = db.addPlayer({ username: 'bo', referralCode: 'BBBBBBB' })
    const old = db.addPlayer({ username: 'old', createdAt: new Date(Date.now() - 8 * DAY) })

    expect(errorKeys(await claim(bo.playerId, 'ZZZZZZZ'))).toContain('ReferralCodeNotFoundErrorType')
    expect(errorKeys(await claim(ana.playerId, 'AAAAAAA'))).toContain('ReferralNotAllowedErrorType')
    expect(errorKeys(await claim(old.playerId, 'AAAAAAA'))).toContain('ReferralNotAllowedErrorType')

    expect((await claim(bo.playerId, 'AAAAAAA')).successful).toBe(true)
    expect(errorKeys(await claim(bo.playerId, 'AAAAAAA'))).toContain('ReferralNotAllowedErrorType')
    // Ana can't now claim Bo's code: Bo joined with hers.
    expect(errorKeys(await claim(ana.playerId, 'BBBBBBB'))).toContain('ReferralNotAllowedErrorType')
    expect(db.rows.Referral).toHaveLength(1)
  })
})

describe('qualifying for the reward', () => {
  const qualify = (...playerIds) => QualifyReferralsService.execute({ playerIds }, db.context)
  const refer = (referrer, referee) => db.context.dbModels.Referral.create({ referrerId: referrer.playerId, refereeId: referee.playerId, code: 'AAAAAAA' })

  it('waits for a saved account and enough rounds, then pays both players once', async () => {
    const ana = db.addPlayer({ username: 'ana' })
    const bo = db.addPlayer({ username: 'bo', isGuest: true })
    await refer(ana, bo)

    rounds[bo.playerId] = REFERRAL_ROUNDS_REQUIRED
    expect((await qualify(bo.playerId)).result.rewarded).toEqual([])
    db.rows.Player[1].isGuest = false
    rounds[bo.playerId] = REFERRAL_ROUNDS_REQUIRED - 1
    expect((await qualify(bo.playerId)).result.rewarded).toEqual([])

    rounds[bo.playerId] = REFERRAL_ROUNDS_REQUIRED
    expect((await qualify(bo.playerId)).result.rewarded).toEqual([1])
    expect(ApplyWalletTransactionService.execute.mock.calls.map(([args]) => [args.playerId, args.amount, args.type, args.idempotencyKey])).toEqual([
      [bo.playerId, REFERRAL_REWARDS.FRIEND, 'REFERRAL_BONUS', 'referral:1:friend'],
      [ana.playerId, REFERRAL_REWARDS.REFERRER, 'REFERRAL_BONUS', 'referral:1:referrer']
    ])
    expect(db.rows.Referral[0]).toMatchObject({ status: 'REWARDED', referrerReward: REFERRAL_REWARDS.REFERRER, refereeReward: REFERRAL_REWARDS.FRIEND })
    expect(RouletteEmitter.walletUpdated).toHaveBeenCalledTimes(2)

    // Later rounds don't pay again.
    expect((await qualify(bo.playerId)).result.rewarded).toEqual([])
    expect(ApplyWalletTransactionService.execute).toHaveBeenCalledTimes(2)
  })

  it('rejects a friend who has played on the referrer\'s device', async () => {
    const ana = db.addPlayer({ username: 'ana' })
    const alt = db.addPlayer({ username: 'ana_alt' })
    await refer(ana, alt)
    rounds[alt.playerId] = REFERRAL_ROUNDS_REQUIRED
    shareADevice.mockResolvedValue(true)

    expect((await qualify(alt.playerId)).result.rewarded).toEqual([])
    expect(db.rows.Referral[0]).toMatchObject({ status: 'REJECTED', rejectReason: 'SAME_DEVICE' })
    expect(ApplyWalletTransactionService.execute).not.toHaveBeenCalled()
  })

  it('stops paying the referrer after the cap, but still pays the friend', async () => {
    const ana = db.addPlayer({ username: 'ana' })
    for (let i = 0; i < REFERRAL_MAX_REWARDED; i++) {
      const earlier = db.addPlayer({ username: `f${i}` })
      db.rows.Referral.push({ referralId: 100 + i, referrerId: ana.playerId, refereeId: earlier.playerId, status: 'REWARDED', referrerReward: 1000 })
    }
    const late = db.addPlayer({ username: 'late' })
    await refer(ana, late)
    rounds[late.playerId] = REFERRAL_ROUNDS_REQUIRED

    await qualify(late.playerId)
    expect(ApplyWalletTransactionService.execute.mock.calls.map(([args]) => args.playerId)).toEqual([late.playerId])
    expect(db.rows.Referral.at(-1)).toMatchObject({ status: 'REWARDED', referrerReward: 0, refereeReward: REFERRAL_REWARDS.FRIEND })
  })
})
