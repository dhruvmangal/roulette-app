import { useEffect, useState } from 'react'
import type { WalletTransaction } from '@roulette/contracts'
import { useI18n, type MessageKey } from './i18n'
import { errorMessage, useSession } from './session'

const PAGE_SIZE = 20

const WHEN: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }

/** The online wallet: balance and every chip that moved, newest first. */
export function WalletScreen ({ onBonuses }: { onBonuses: () => void }) {
  const { api, balance } = useSession()
  const { t, number, date } = useI18n()
  const [rows, setRows] = useState<WalletTransaction[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.transactions({ limit: PAGE_SIZE, pageNo: page })
      .then(({ transactions }) => {
        if (cancelled) return
        setRows(current => page === 1 ? transactions.rows : [...current, ...transactions.rows])
        setTotal(transactions.count)
      })
      .catch(failure => { if (!cancelled) setError(errorMessage(failure)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [api, page])

  return (
    <main className="page">
      <section className="page-head">
        <p className="eyebrow">{t('wallet.eyebrow')}</p>
        <h1 className="page-title">{balance === null ? '—' : number(balance)} <em>{t('wallet.chips')}</em></h1>
        <p className="lede">{t('wallet.lede')}</p>
        <button type="button" className="btn-ghost small" onClick={onBonuses}>{t('wallet.freeChips')}</button>
      </section>

      <section className="ledger" aria-labelledby="ledger-heading">
        <h2 id="ledger-heading" className="eyebrow">{t('wallet.ledger')}</h2>
        {error && <p className="form-error" role="alert">{error}</p>}
        <ol className="ledger-list">
          {rows.map(row => (
            <li key={row.walletTransactionId} className={row.direction === 'CREDIT' ? 'is-credit' : 'is-debit'}>
              <span className="ledger-type">{t(`ledger.${row.type}` as MessageKey) === `ledger.${row.type}` ? row.type : t(`ledger.${row.type}` as MessageKey)}</span>
              <time className="ledger-when" dateTime={row.createdAt}>{date(row.createdAt, WHEN)}</time>
              <span className="ledger-amount">{row.direction === 'CREDIT' ? '+' : '−'}{number(row.amount)}</span>
              <span className="ledger-after">{number(row.balanceAfter)}</span>
            </li>
          ))}
        </ol>
        {!loading && !rows.length && !error && <p className="dialog-copy">{t('wallet.empty')}</p>}
        {rows.length < total && (
          <button type="button" className="btn-ghost small" disabled={loading} onClick={() => setPage(next => next + 1)}>
            {loading ? t('common.loading') : t('common.showMore')}
          </button>
        )}
      </section>
    </main>
  )
}
