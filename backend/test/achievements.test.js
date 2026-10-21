import { EvaluateAchievementsService, GetAchievementsService } from '~/services/achievement'
import { NotifyPlayerService } from '~/services/notification'
import { ApplyWalletTransactionService } from '~/services/wallet'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { computeMetrics, currentWinStreak, reached } from '~/utils/achievement.utils'
import { ACHIEVEMENTS } from '~/utils/constants/achievement.constants'

jest.mock('~/utils/achievement.utils', () => ({ ...jest.requireActual('~/utils/achievement.utils'), computeMetrics: jest.fn() }))
jest.mock('~/services/wallet', () => ({ ApplyWalletTransactionService: { execute: jest.fn() } }))
jest.mock('~/services/notification', () => ({ NotifyPlayerService: { execute: jest.fn(async () => ({ successful: true, result: {} })) } }))
jest.mock('~/socket-resources/emitters/roulette.emitter', () => ({ __esModule: true, default: { walletUpdated: jest.fn() } }))

const KNOWN_METRICS = ['rounds', 'roundsWon', 'winStreak', 'bigWin', 'straightWins', 'zeroWins', 'betTypes', 'variants', 'hostedWithFriend', 'friends', 'referralsRewarded', 'dailyStreak']

describe('the achievements', () => {
  it('are well formed: unique codes, real metrics, reachable targets, modest rewards', () => {
    expect(new Set(ACHIEVEMENTS.map(a => a.code)).size).toBe(ACHIEVEMENTS.length)
    for (const a of ACHIEVEMENTS) {
      expect(KNOWN_METRICS).toContain(a.metric)
      expect(a.target).toBeGreaterThan(0)
      expect(a.reward).toBeGreaterThanOrEqual(0)
      expect(a.reward).toBeLessThanOrEqual(1000)
      expect(a.code).toMatch(/^[A-Z_]{3,32}$/)
    }
  })

  it('harder tiers of one thing pay more', () => {
    for (const metric of KNOWN_METRICS) {
      const tiers = ACHIEVEMENTS.filter(a => a.metric === metric).sort((a, b) => a.target - b.target)
      tiers.slice(1).forEach((tier, i) => expect(tier.reward).toBeGreaterThanOrEqual(tiers[i].reward))
    }
  })
})

describe('working out what was reached', () => {
  it('counts a win streak back from the latest round', () => {
    expect(currentWinStreak([5, 5, 5, -1, 5])).toBe(3)
    expect(currentWinStreak([-1, 5, 5])).toBe(0)
    expect(currentWinStreak([0, 5])).toBe(0)
    expect(currentWinStreak(['10', '20'])).toBe(2)
    expect(currentWinStreak([])).toBe(0)
  })

  it('offers only what is met, not yet earned, and in the groups asked about', () => {
    const metrics = { rounds: 30, roundsWon: 4, friends: 1 }
    expect(reached(metrics, []).map(a => a.code).sort()).toEqual(['FIRST_FRIEND', 'FIRST_SPIN', 'FIRST_WIN', 'REGULAR'])
    expect(reached(metrics, ['FIRST_SPIN']).map(a => a.code)).not.toContain('FIRST_SPIN')
    expect(reached(metrics, [], ['friends']).map(a => a.code)).toEqual(['FIRST_FRIEND'])
    expect(reached({}, [])).toEqual([])
  })
})

/** In-memory player_achievements with the unique (player, code) rule. */
function fakeDb () {
  const rows = []
  const instance = (row) => {
    const copy = { ...row }
    Object.defineProperty(copy, 'update', { value: async (values) => Object.assign(copy, Object.assign(row, values)) })
    return copy
  }
  return {
    rows,
    context: {
      dbModels: {
        PlayerAchievement: {
          findAll: async ({ where }) => rows.filter(row => row.playerId === where.playerId).map(instance),
          create: async (values) => {
            if (rows.some(row => row.playerId === values.playerId && row.code === values.code)) throw Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' })
            const row = { playerAchievementId: rows.length + 1, ...values }
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

let db
beforeEach(() => {
  jest.clearAllMocks()
  db = fakeDb()
  ApplyWalletTransactionService.execute.mockImplementation(async ({ playerId, amount }) => ({
    successful: true, result: { wallet: { playerId, balance: 1000 + amount }, walletTransaction: { walletTransactionId: 99 } }
  }))
})

const evaluate = (args) => EvaluateAchievementsService.execute(args, db.context)

describe('awarding achievements', () => {
  it('records each one, pays the reward through the ledger, and tells the player', async () => {
    computeMetrics.mockResolvedValue({ rounds: 1, roundsWon: 1 })
    const done = await evaluate({ playerIds: [7] })

    expect(done.result.unlocked).toEqual([{ playerId: 7, code: 'FIRST_SPIN', reward: 50 }, { playerId: 7, code: 'FIRST_WIN', reward: 50 }])
    expect(db.rows.map(row => [row.code, row.reward, row.walletTransactionId])).toEqual([['FIRST_SPIN', 50, 99], ['FIRST_WIN', 50, 99]])
    expect(ApplyWalletTransactionService.execute.mock.calls[0][0]).toMatchObject({
      playerId: 7, amount: 50, direction: 'CREDIT', type: 'ACHIEVEMENT_BONUS', referenceId: 'ACHIEVEMENT:FIRST_SPIN', idempotencyKey: 'achievement:FIRST_SPIN:player:7'
    })
    expect(RouletteEmitter.walletUpdated).toHaveBeenCalledTimes(2)
    const told = NotifyPlayerService.execute.mock.calls[0][0]
    expect(told.event).toEqual({ name: 'achievement:unlocked', payload: { code: 'FIRST_SPIN', reward: 50 } })
    expect(told.push).toMatchObject({ category: 'achievements', type: 'achievement', vars: { reward: '50' }, dedupeKey: 'achievement:FIRST_SPIN:7' })
  })

  it('awards each only once, however often it is checked', async () => {
    computeMetrics.mockResolvedValue({ rounds: 1 })
    await evaluate({ playerIds: [7] })
    const again = await evaluate({ playerIds: [7] })
    expect(again.result.unlocked).toEqual([])
    expect(ApplyWalletTransactionService.execute).toHaveBeenCalledTimes(1)
  })

  it('does not pay twice when two checks race for the same one', async () => {
    computeMetrics.mockResolvedValue({ rounds: 1 })
    const [a, b] = await Promise.all([evaluate({ playerIds: [7] }), evaluate({ playerIds: [7] })])
    expect(a.result.unlocked.length + b.result.unlocked.length).toBe(1)
    expect(ApplyWalletTransactionService.execute).toHaveBeenCalledTimes(1)
  })

  it('only looks at the groups an event could have changed, and trusts numbers it was handed', async () => {
    computeMetrics.mockResolvedValue({ friends: 5, rounds: 999 })
    const done = await evaluate({ playerIds: [7], groups: ['friends'] })
    expect(computeMetrics.mock.calls[0][2]).toEqual(['friends'])
    expect(done.result.unlocked.map(entry => entry.code)).toEqual(['FIRST_FRIEND', 'SOCIALITE'])

    computeMetrics.mockResolvedValue({})
    const daily = await evaluate({ playerIds: [8], groups: ['daily'], metrics: { dailyStreak: 7 } })
    expect(daily.result.unlocked).toEqual([{ playerId: 8, code: 'DAILY_WEEK', reward: 300 }])
  })

  it('checks every player it is given, once each', async () => {
    computeMetrics.mockResolvedValue({ rounds: 1 })
    const done = await evaluate({ playerIds: [1, 2, 2] })
    expect(done.result.unlocked.map(entry => entry.playerId)).toEqual([1, 2])
  })

  it('keeps the achievement out if the reward could not be paid', async () => {
    computeMetrics.mockResolvedValue({ rounds: 1 })
    ApplyWalletTransactionService.execute.mockResolvedValue({ successful: false, errors: { ApplyWalletTransactionService: { WalletNotFoundErrorType: 'x' } } })
    const done = await evaluate({ playerIds: [7] })
    expect(done.successful).toBe(false)
  })
})

describe('the achievements list', () => {
  it('shows progress toward each, and keeps an earned one full', async () => {
    db.rows.push({ playerId: 7, code: 'HOT_STREAK', reward: 150, unlockedAt: new Date('2026-10-01') })
    computeMetrics.mockResolvedValue({ rounds: 12, winStreak: 0, bigWin: 800 })
    const { result } = await GetAchievementsService.execute({ playerId: 7 }, db.context)

    const entry = (code) => result.achievements.find(achievement => achievement.code === code)
    expect(entry('REGULAR')).toMatchObject({ progress: 12, target: 25, unlockedAt: null })
    expect(entry('BIG_WIN')).toMatchObject({ progress: 500, target: 500 })
    expect(entry('HIGH_ROLLER')).toMatchObject({ progress: 800, target: 2500 })
    expect(entry('HOT_STREAK')).toMatchObject({ progress: 3, target: 3 })
    expect(entry('HOT_STREAK').unlockedAt).toEqual(new Date('2026-10-01'))
    expect(result.totals).toEqual({ unlocked: 1, total: ACHIEVEMENTS.length, chipsEarned: 150 })
  })
})
