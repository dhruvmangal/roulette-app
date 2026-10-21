import { ApplyWalletTransactionService } from '~/services/wallet'
import { fakeLedger } from './helpers/fakeLedger'

const credit = (playerId, amount, idempotencyKey, type = 'ADMIN_ADJUST') =>
  ({ playerId, amount, direction: 'CREDIT', type, idempotencyKey })
const debit = (playerId, amount, idempotencyKey) =>
  ({ playerId, amount, direction: 'DEBIT', type: 'BET', idempotencyKey })

const errorKeys = (service) => Object.values(service.errors).flatMap(errors => Array.isArray(errors) ? errors : Object.keys(errors))

/** balance === sum(credits) - sum(debits), the ledger invariant. */
const ledgerTotal = (ledger, playerId) => ledger
  .filter(row => row.playerId === playerId)
  .reduce((sum, row) => sum + (row.direction === 'CREDIT' ? row.amount : -row.amount), 0)

describe('ApplyWalletTransactionService', () => {
  let db
  const apply = (args) => ApplyWalletTransactionService.execute(args, db.context)

  beforeEach(() => {
    db = fakeLedger()
    db.openWallet(1)
  })

  it('credits and debits, recording the balance before and after', async () => {
    await apply(credit(1, 1000, 'c1'))
    const spent = await apply(debit(1, 250, 'd1'))

    expect(spent.successful).toBe(true)
    expect(spent.result.wallet.balance).toBe(750)
    expect(spent.result.walletTransaction).toMatchObject({ balanceBefore: 1000, balanceAfter: 750, amount: 250, direction: 'DEBIT' })
    expect(db.balanceOf(1)).toBe(750)
  })

  it('refuses to overdraw and writes nothing', async () => {
    await apply(credit(1, 100, 'c1'))
    const spent = await apply(debit(1, 101, 'd1'))

    expect(spent.successful).toBe(false)
    expect(errorKeys(spent)).toEqual(['InsufficientBalanceErrorType'])
    expect(db.balanceOf(1)).toBe(100)
    expect(db.ledger).toHaveLength(1)
  })

  it('replays a repeated idempotency key instead of moving chips twice', async () => {
    const first = await apply(credit(1, 500, 'bonus:1'))
    const again = await apply(credit(1, 500, 'bonus:1'))

    expect(again.successful).toBe(true)
    expect(again.result.replayed).toBe(true)
    expect(again.result.walletTransaction.walletTransactionId).toBe(first.result.walletTransaction.walletTransactionId)
    expect(db.balanceOf(1)).toBe(500)
    expect(db.ledger).toHaveLength(1)
  })

  it('rejects an idempotency key reused for a different transaction', async () => {
    await apply(credit(1, 500, 'k'))
    const reused = await apply(credit(1, 900, 'k'))

    expect(errorKeys(reused)).toEqual(['IdempotencyKeyConflictErrorType'])
    expect(db.balanceOf(1)).toBe(500)
  })

  it('needs an existing wallet and a positive whole amount', async () => {
    expect(errorKeys(await apply(credit(2, 10, 'x')))).toEqual(['WalletNotFoundErrorType'])
    expect((await apply(credit(1, 0, 'zero'))).successful).toBe(false)
    expect((await apply(credit(1, 1.5, 'fraction'))).successful).toBe(false)
    expect((await apply({ ...credit(1, 10, 'odd'), direction: 'SIDEWAYS' })).successful).toBe(false)
    expect(db.ledger).toHaveLength(0)
  })

  it('never overdraws under concurrent debits', async () => {
    await apply(credit(1, 100, 'c1'))
    const attempts = await Promise.all(Array.from({ length: 20 }, (_, i) => apply(debit(1, 10, `bet:${i}`))))

    expect(attempts.filter(attempt => attempt.successful)).toHaveLength(10)
    expect(db.balanceOf(1)).toBe(0)
    expect(ledgerTotal(db.ledger, 1)).toBe(0)
  })

  it('keeps balance equal to credits minus debits through any sequence', async () => {
    db.openWallet(2)
    let seed = 42
    const next = (max) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % max }
    for (let i = 0; i < 300; i++) {
      const playerId = 1 + next(2)
      const amount = 1 + next(200)
      await apply(next(3) ? credit(playerId, amount, `c${i}`) : debit(playerId, amount, `d${i}`))
    }
    for (const playerId of [1, 2]) {
      expect(db.balanceOf(playerId)).toBe(ledgerTotal(db.ledger, playerId))
      expect(db.balanceOf(playerId)).toBeGreaterThanOrEqual(0)
    }
    for (const row of db.ledger) {
      expect(row.balanceAfter).toBe(row.balanceBefore + (row.direction === 'CREDIT' ? row.amount : -row.amount))
    }
  })
})
