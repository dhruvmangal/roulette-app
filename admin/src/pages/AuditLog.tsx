import { api, type AuditLog as Log, type Page } from '../api'
import { ErrorNote, Link, Loading, Pager } from '../components/ui'
import { label, signed, when } from '../format'
import { setParams } from '../router'
import { useApi } from '../useApi'

function describe (log: Log) {
  const d = log.details as Record<string, unknown>
  switch (log.action) {
    case 'WALLET_ADJUST': return `${signed((d.direction === 'DEBIT' ? -1 : 1) * Number(d.amount))} chips — “${String(d.reason)}”`
    case 'PLAYER_STATUS': return `${String(d.from)} → ${String(d.to)} — “${String(d.reason)}”`
    case 'PLAYER_LOGOUT': return 'Signed out everywhere'
    case 'BONUS_UPDATE': return `${String(d.code)}: ${Object.entries((d.after ?? {}) as Record<string, unknown>).map(([k, v]) => `${k} ${String((d.before as Record<string, unknown>)?.[k])} → ${String(v)}`).join(', ')}`
    case 'SETTINGS_UPDATE': return `ads ${Object.entries((d.after ?? {}) as Record<string, unknown>).map(([k, v]) => `${k} ${String((d.before as Record<string, unknown>)?.[k])} → ${String(v)}`).join(', ')}`
    default: return JSON.stringify(d)
  }
}

export function AuditLog ({ params }: { params: URLSearchParams }) {
  const pageNo = Number(params.get('page') ?? 1)
  const { data, error } = useApi(() => api<{ logs: Log[] } & Page>('GET', '/audit-logs', { query: { pageNo, limit: 50 } }), `audit:${pageNo}`)

  return (
    <>
      <header className='page-head'><h1>Audit log</h1></header>
      <p className='muted lead'>Every change an admin made. Entries can't be edited or deleted.</p>
      {error && <ErrorNote error={error} />}
      {!data ? <Loading /> : (
        <>
          <div className='table-wrap'>
            <table className='data'>
              <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
              <tbody>
                {data.logs.map(log => (
                  <tr key={log.adminAuditLogId}>
                    <td className='nowrap'>{when(log.createdAt)}</td>
                    <td>{log.adminEmail}</td>
                    <td>{label(log.action)}</td>
                    <td>{log.targetType === 'PLAYER' ? <Link to={`/players/${log.targetId}`}>Player #{log.targetId}</Link> : log.targetType === 'BONUS' ? <Link to='/bonuses'>Bonus #{log.targetId}</Link> : '—'}</td>
                    <td>{describe(log)}</td>
                  </tr>
                ))}
                {data.logs.length === 0 && <tr><td colSpan={5} className='empty'>Nothing yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager count={data.count} pageNo={data.pageNo} limit={data.limit} onPage={page => setParams('/audit', params, { page })} />
        </>
      )}
    </>
  )
}
