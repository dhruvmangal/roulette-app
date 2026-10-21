/**
 * An in-memory stand-in for the Wallet and WalletTransaction models, enough
 * for ApplyWalletTransactionService. `lock: transaction.LOCK.UPDATE` queues
 * behind other transactions holding the same wallet until they finish, as a
 * Postgres row lock does, so concurrency behaviour can be tested without a
 * database.
 */
export function fakeLedger () {
  const wallets = new Map()
  const ledger = []
  const lockQueues = new Map()

  const plain = (row) => ({ ...row, get: () => ({ ...row }) })
  // Every query yields, so concurrent transactions interleave as they would
  // over a real database connection.
  const roundTrip = () => new Promise(resolve => setImmediate(resolve))

  const acquire = async (transaction, walletId) => {
    const previous = lockQueues.get(walletId) || Promise.resolve()
    let release
    const held = new Promise(resolve => { release = resolve })
    lockQueues.set(walletId, previous.then(() => held))
    await previous
    transaction.releases.push(release)
  }

  const Wallet = {
    findOne: async ({ where: { playerId }, lock, transaction }) => {
      const row = wallets.get(playerId)
      if (!row) return null
      if (lock) await acquire(transaction, row.walletId)
      await roundTrip()
      // Like a Sequelize instance, update() changes the stored row and this copy.
      const instance = { ...row }
      instance.update = async (values) => {
        await roundTrip()
        return Object.assign(instance, Object.assign(row, values))
      }
      return instance
    }
  }

  const WalletTransaction = {
    findOne: async ({ where: { idempotencyKey } }) => {
      await roundTrip()
      const row = ledger.find(entry => entry.idempotencyKey === idempotencyKey)
      return row ? plain(row) : null
    },
    create: async (values) => {
      await roundTrip()
      if (ledger.some(entry => entry.idempotencyKey === values.idempotencyKey)) throw new Error('duplicate idempotency key')
      const row = { walletTransactionId: ledger.length + 1, ...values }
      ledger.push(row)
      return plain(row)
    }
  }

  const sequelize = {
    transaction: async (work) => {
      const transaction = { LOCK: { UPDATE: 'UPDATE' }, releases: [] }
      try {
        return await work(transaction)
      } finally {
        transaction.releases.forEach(release => release())
      }
    }
  }

  return {
    context: { dbModels: { Wallet, WalletTransaction }, sequelize },
    ledger,
    openWallet: (playerId, balance = 0) => {
      wallets.set(playerId, { walletId: wallets.size + 1, playerId, balance, lockedBalance: 0, currency: 'CHIP', version: 0 })
    },
    balanceOf: (playerId) => wallets.get(playerId).balance
  }
}
