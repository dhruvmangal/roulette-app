import { api, TRANSACTION_TYPES, type Page, type Transaction } from '../api'
import { Amount, ErrorNote, Link, Loading, Pager } from '../components/ui'
import { chips, label, when } from '../format'
import { setParams } from '../router'
import { useApi } from '../useApi'

/** Describes where a ledger row came from, e.g. the admin's reason or the bet's round. */
function source (t: Transaction) {
  const reason = typeof t.metadata?.reason === 'string' ? t.metadata.reason : null
  if (t.type === 'ADMIN_ADJUST') return <>{reason ?? '—'} <span className='muted'>by {String(t.metadata?.adminEmail ?? `admin #${t.referenceId}`)}</span></>
  if (t.referenceType) return <span className='muted'>{label(t.referenceType)} {t.referenceId}</span>
  return <span className='muted'>—</span>
}

export function TransactionsTable ({ rows, showPlayer = true }: { rows: Transaction[], showPlayer?: boolean }) {
  return (
    <div className='table-wrap'>
      <table className='data'>
        <thead>
          <tr>
            <th>When</th>{showPlayer && <th>Player</th>}<th>Type</th><th className='num'>Amount</th><th className='num'>Balance after</th><th>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(t => (
            <tr key={t.walletTransactionId}>
              <td className='nowrap'>{when(t.createdAt)}<div className='muted'>#{t.walletTransactionId}</div></td>
              {showPlayer && <td><Link to={`/players/${t.playerId}`}>{t.username}</Link></td>}
              <td>{label(t.type)}</td>
              <td className='num'><Amount value={t.amount} direction={t.direction} /></td>
              <td className='num'>{chips(t.balanceAfter)}</td>
              <td>{source(t)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={showPlayer ? 6 : 5} className='empty'>No transactions.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

const toIso = (date: string, endOfDay: boolean) => (date ? new Date(`${date}T${endOfDay ? '23:59:59.999' : '00:00:00'}`).toISOString() : undefined)

export function Transactions ({ params }: { params: URLSearchParams }) {
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const query = {
    playerId: params.get('playerId') ?? '',
    type: params.get('type') ?? '',
    direction: params.get('direction') ?? '',
    minAmount: params.get('minAmount') ?? '',
    from: toIso(from, false),
    to: toIso(to, true),
    pageNo: Number(params.get('page') ?? 1),
    limit: 50
  }
  const update = (changes: Record<string, string | undefined>) => setParams('/transactions', params, { page: undefined, ...changes })
  const { data, error } = useApi(() => api<{ transactions: Transaction[] } & Page>('GET', '/transactions', { query }), JSON.stringify(query))

  return (
    <>
      <header className='page-head'><h1>Transactions</h1></header>
      <div className='filters'>
        <input inputMode='numeric' placeholder='Player id' value={query.playerId} onChange={e => update({ playerId: e.target.value.replace(/\D/g, '') })} aria-label='Player id' />
        <select value={query.type} onChange={e => update({ type: e.target.value })} aria-label='Type'>
          <option value=''>All types</option>
          {TRANSACTION_TYPES.map(type => <option key={type} value={type}>{label(type)}</option>)}
        </select>
        <select value={query.direction} onChange={e => update({ direction: e.target.value })} aria-label='Direction'>
          <option value=''>Credits and debits</option><option value='CREDIT'>Credits</option><option value='DEBIT'>Debits</option>
        </select>
        <input inputMode='numeric' placeholder='Min amount' value={query.minAmount} onChange={e => update({ minAmount: e.target.value.replace(/\D/g, '') })} aria-label='Minimum amount' />
        <label className='inline'>From <input type='date' value={from} onChange={e => update({ from: e.target.value })} /></label>
        <label className='inline'>To <input type='date' value={to} onChange={e => update({ to: e.target.value })} /></label>
      </div>
      {error && <ErrorNote error={error} />}
      {!data ? <Loading /> : (
        <>
          <TransactionsTable rows={data.transactions} />
          <Pager count={data.count} pageNo={data.pageNo} limit={data.limit} onPage={page => setParams('/transactions', params, { page })} />
        </>
      )}
    </>
  )
}
