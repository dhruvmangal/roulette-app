import { crashPoint, resolveCrashBets, timeToMultiplier } from '@roulette/engine'
import { CashOutCrashService, GetActiveCrashService, PlayArcadeService, StartCrashService } from '~/services/arcade'
import { ApplyWalletTransactionService } from '~/services/wallet'

jest.mock('@roulette/engine', () => ({ ...jest.requireActual('@roulette/engine'), crashPoint: jest.fn() }))
jest.mock('~/services/wallet', () => ({ ApplyWalletTransactionService: { execute: jest.fn() } }))

const errorKeys = (service) => Object.values(service.errors).flatMap((errors) => Array.isArray(errors) ? errors : Object.keys(errors))

/** In-memory arcade_rounds and one wallet, with the query shapes the arcade services use. */
function fakeDb (balance = 1000) {
  const state = { rounds: [], balance, ledger: [] }
  const instance = (row) => Object.defineProperty({ ...row }, 'update', {
    value: async (values) => { Object.assign(row, values); return Object.assign(instance, row) }
  })
  const view = (row) => {
    const copy = new Proxy(row, { get: (target, key) => key === 'update' ? async (values) => { Object.assign(target, values) } : target[key] })
    return copy
  }
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => row[key] === value)
  return {
    state,
    context: {
      dbModels: {
        ArcadeRound: {
          findOne: async ({ where }) => { const row = state.rounds.find((r) => matches(r, where)); return row ? view(row) : null },
          findAll: async ({ where }) => state.rounds.filter((r) => matches(r, where)).map(view),
          create: async (values) => { const row = { arcadeRoundId: state.rounds.length + 1, ...values }; state.rounds.push(row); return view(row) }
        },
        Wallet: { findOne: async () => ({ walletId: 1, balance: state.balance, lockedBalance: 0, currency: 'CHIP', version: 1 }) }
      },
      sequelize: { transaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }) }
    }
  }
}

/** The wallet service, standing in as a ledger over db.state. */
function ledgerFor (db) {
  ApplyWalletTransactionService.execute.mockImplementation(async (args) => {
    const { amount, direction, idempotencyKey } = args
    const delta = direction === 'DEBIT' ? -amount : amount
    if (db.state.balance + delta < 0) return { successful: false, errors: { ApplyWalletTransactionService: { InsufficientBalanceErrorType: 'no' } } }
    db.state.balance += delta
    db.state.ledger.push({ ...args })
    return { successful: true, result: { wallet: { balance: db.state.balance, walletId: 1, lockedBalance: 0, currency: 'CHIP', version: 1 }, walletTransaction: { idempotencyKey } } }
  })
}

const T0 = new Date('2026-10-21T12:00:00Z')
let db
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(T0)
  db = fakeDb(1000)
  ledgerFor(db)
  crashPoint.mockReturnValue(3)
})
afterEach(() => { jest.useRealTimers(); jest.clearAllMocks() })

const afterMs = (ms) => jest.setSystemTime(new Date(T0.getTime() + ms))
const flight = (bets = [{ stake: 100 }], game = 'AVIATOR', requestId = 'r1') => StartCrashService.execute({ playerId: 1, game, bets, requestId }, db.context)

describe('PlayArcadeService', () => {
  it('takes the stake, draws the game and pays what it won', async () => {
    const played = await PlayArcadeService.execute({ playerId: 1, game: 'PLINKO', stake: 100, rows: 8, risk: 'low', requestId: 'a' }, db.context)
    expect(played.successful).toBe(true)
    const { round, wallet } = played.result
    expect(round.status).toBe('SETTLED')
    expect(round.stake).toBe(100)
    expect(round.outcome.path).toHaveLength(8)
    expect(wallet.balance).toBe(1000 - 100 + round.payout)
    const [bet, win] = db.state.ledger
    expect(bet).toMatchObject({ direction: 'DEBIT', type: 'BET', amount: 100, referenceType: 'ARCADE' })
    if (round.payout > 0) expect(win).toMatchObject({ direction: 'CREDIT', type: 'WIN', amount: round.payout })
  })

  it('returns the same round for a repeated requestId and moves no chips twice', async () => {
    const args = { playerId: 1, game: 'WHEEL', stake: 50, risk: 'medium', requestId: 'same' }
    const first = await PlayArcadeService.execute(args, db.context)
    const ledgerSize = db.state.ledger.length
    const again = await PlayArcadeService.execute(args, db.context)
    expect(again.result.replayed).toBe(true)
    expect(again.result.round.arcadeRoundId).toBe(first.result.round.arcadeRoundId)
    expect(db.state.ledger).toHaveLength(ledgerSize)
  })

  it('stakes the sum of the horses backed, and only the winner pays', async () => {
    const played = await PlayArcadeService.execute({ playerId: 1, game: 'HORSES', bets: [{ horse: 0, stake: 100 }, { horse: 3, stake: 200 }], requestId: 'h' }, db.context)
    expect(played.successful).toBe(true)
    expect(played.result.round.stake).toBe(300)
    expect(db.state.ledger[0]).toMatchObject({ direction: 'DEBIT', amount: 300 })
    expect([...played.result.round.outcome.order].sort()).toEqual([0, 1, 2, 3, 4, 5])
  })

  it.each([
    ['a stake under the minimum', { stake: 5 }, 'ArcadeBetLimitErrorType'],
    ['a stake over the maximum', { stake: 10001 }, 'ArcadeBetLimitErrorType'],
    ['a board with too few rows', { rows: 4 }, 'ArcadeBadChoiceErrorType']
  ])('refuses %s', async (_name, change, error) => {
    const played = await PlayArcadeService.execute({ playerId: 1, game: 'PLINKO', stake: 100, rows: 8, risk: 'low', requestId: 'x', ...change }, db.context)
    expect(played.successful).toBe(false)
    expect(errorKeys(played)).toContain(error)
    expect(db.state.ledger).toHaveLength(0)
  })

  it('refuses the same horse twice and a horse that does not exist', async () => {
    for (const bets of [[{ horse: 1, stake: 10 }, { horse: 1, stake: 10 }], [{ horse: 6, stake: 10 }]]) {
      const played = await PlayArcadeService.execute({ playerId: 1, game: 'HORSES', bets, requestId: 'bad' }, db.context)
      expect(errorKeys(played)).toContain('ArcadeBadChoiceErrorType')
    }
  })

  it('passes on a wallet that cannot cover the stake', async () => {
    db.state.balance = 20
    const played = await PlayArcadeService.execute({ playerId: 1, game: 'WHEEL', stake: 100, risk: 'low', requestId: 'poor' }, db.context)
    expect(played.successful).toBe(false)
    expect(JSON.stringify(played.errors)).toContain('InsufficientBalanceErrorType')
  })
})

describe('crash flights', () => {
  it('debits each bet and keeps the crash point from the player', async () => {
    const started = await flight([{ stake: 100 }, { stake: 50, autoCashout: 2 }], 'AVIATOR')
    expect(started.successful).toBe(true)
    const { round, wallet } = started.result
    expect(wallet.balance).toBe(850)
    expect(round.status).toBe('ACTIVE')
    expect(round.elapsedMs).toBe(0)
    expect(JSON.stringify(round)).not.toContain('crashPoint')
    expect(db.state.ledger.map((entry) => entry.idempotencyKey)).toEqual(['arcade:bet:1:0', 'arcade:bet:1:1'])
  })

  it('takes one or two bets', async () => {
    expect((await flight([{ stake: 10 }, { stake: 10 }], 'AVIATOR', 'r2')).successful).toBe(true)
    expect((await flight([{ stake: 10 }, { stake: 10 }, { stake: 10 }], 'AVIATOR', 'r3')).successful).toBe(false)
  })

  it('refuses an auto cash-out that is not a price on offer', async () => {
    for (const autoCashout of [1.005, 1.5001, 1001]) {
      expect(errorKeys(await flight([{ stake: 10, autoCashout }]))).toContain('ArcadeBadChoiceErrorType')
    }
  })

  it('allows one flight in the air at a time', async () => {
    await flight()
    afterMs(1000)
    expect(errorKeys(await flight([{ stake: 100 }], 'AVIATOR', 'r2'))).toContain('ArcadeRoundActiveErrorType')
  })

  it('pays a cash-out at the multiplier showing, rounded down', async () => {
    const { result: { round } } = await flight()
    afterMs(timeToMultiplier(2))
    const out = await CashOutCrashService.execute({ playerId: 1, arcadeRoundId: round.arcadeRoundId, slot: 0 }, db.context)
    expect(out.successful).toBe(true)
    expect(out.result.round.status).toBe('SETTLED')
    expect(out.result.round.outcome.bets[0]).toMatchObject({ state: 'CASHED', multiplier: 2, payout: 200 })
    expect(out.result.round.outcome.crashPoint).toBe(3)
    expect(out.result.wallet.balance).toBe(1000 - 100 + 200)
  })

  it('loses a cash-out that arrives after the crash, and pays nothing', async () => {
    const { result: { round } } = await flight()
    afterMs(timeToMultiplier(3) + 5)
    const out = await CashOutCrashService.execute({ playerId: 1, arcadeRoundId: round.arcadeRoundId, slot: 0 }, db.context)
    expect(out.result.round.outcome.bets[0]).toMatchObject({ state: 'CRASHED', payout: 0 })
    expect(out.result.wallet.balance).toBe(900)
    expect(db.state.ledger).toHaveLength(1)
  })

  it('cashes one bet of an aviator flight and leaves the other flying', async () => {
    const { result: { round } } = await flight([{ stake: 100 }, { stake: 100 }], 'AVIATOR')
    afterMs(timeToMultiplier(1.5))
    const out = await CashOutCrashService.execute({ playerId: 1, arcadeRoundId: round.arcadeRoundId, slot: 1 }, db.context)
    expect(out.result.round.status).toBe('ACTIVE')
    expect(out.result.round.outcome.bets.map((bet) => bet.state)).toEqual(['ACTIVE', 'CASHED'])
    expect(JSON.stringify(out.result.round)).not.toContain('crashPoint')
    expect(out.result.wallet.balance).toBe(800 + 150)
  })

  it('does not pay twice when the button is pressed twice', async () => {
    const { result: { round } } = await flight()
    afterMs(timeToMultiplier(2))
    const args = { playerId: 1, arcadeRoundId: round.arcadeRoundId, slot: 0 }
    await CashOutCrashService.execute(args, db.context)
    afterMs(timeToMultiplier(2.5))
    const again = await CashOutCrashService.execute(args, db.context)
    expect(again.result.round.outcome.bets[0].multiplier).toBe(2)
    expect(db.state.balance).toBe(1100)
  })

  it('will not cash out someone else\'s flight', async () => {
    const { result: { round } } = await flight()
    const out = await CashOutCrashService.execute({ playerId: 2, arcadeRoundId: round.arcadeRoundId, slot: 0 }, db.context)
    expect(errorKeys(out)).toContain('ArcadeRoundNotFoundErrorType')
  })

  it('settles a flight the player walked away from, paying its auto cash-out', async () => {
    await flight([{ stake: 100, autoCashout: 2.5 }])
    afterMs(60_000)
    const active = await GetActiveCrashService.execute({ playerId: 1, game: 'AVIATOR' }, db.context)
    expect(active.result.round).toBeNull()
    expect(active.result.landed.outcome.bets[0]).toMatchObject({ state: 'CASHED', multiplier: 2.5, payout: 250 })
    expect(active.result.wallet.balance).toBe(1150)
  })

  it('lets a new flight go once the last has landed', async () => {
    await flight()
    afterMs(60_000)
    const next = await flight([{ stake: 100 }], 'AVIATOR', 'r2')
    expect(next.successful).toBe(true)
    expect(db.state.rounds.map((r) => r.status)).toEqual(['SETTLED', 'ACTIVE'])
  })

  it('resumes a flight that is still in the air', async () => {
    await flight()
    afterMs(2000)
    const active = await GetActiveCrashService.execute({ playerId: 1, game: 'AVIATOR' }, db.context)
    expect(active.result.round.elapsedMs).toBe(2000)
    expect(active.result.landed).toBeNull()
  })
})

describe('resolveCrashBets', () => {
  const bets = [{ slot: 0, stake: 100, autoCashout: null, state: 'ACTIVE' }, { slot: 1, stake: 100, autoCashout: 1.5, state: 'ACTIVE' }]

  it('leaves a flight alone while nothing has happened', () => {
    const { bets: next, settled, over } = resolveCrashBets({ crashPoint: 5, bets }, 100)
    expect(settled).toEqual([])
    expect(over).toBe(false)
    expect(next).toEqual(bets)
  })

  it('crashes bets with no cash-out and cashes the auto ones', () => {
    const { bets: next, over } = resolveCrashBets({ crashPoint: 5, bets }, timeToMultiplier(5))
    expect(next.map((bet) => [bet.state, bet.payout])).toEqual([['CRASHED', 0], ['CASHED', 150]])
    expect(over).toBe(true)
  })
})
