import { api, type ChatReport, type Page } from '../api'
import { ErrorNote, Link, Loading, Pager, StatusBadge } from '../components/ui'
import { ago, when } from '../format'
import { setParams } from '../router'
import { useApi } from '../useApi'

export function ChatReports ({ params }: { params: URLSearchParams }) {
  const pageNo = Number(params.get('page') ?? 1)
  const { data, error } = useApi(() => api<{ reports: ChatReport[] } & Page>('GET', '/chat-reports', { query: { pageNo, limit: 25 } }), `reports:${pageNo}`)

  return (
    <>
      <header className='page-head'><h1>Chat reports</h1></header>
      <p className='muted lead'>Messages players reported. Open the author to ban them; a ban drops them from every table.</p>
      {error && <ErrorNote error={error} />}
      {!data ? <Loading /> : (
        <>
          <div className='table-wrap'>
            <table className='data'>
              <thead><tr><th>Message</th><th>Author</th><th>Table</th><th className='num'>Reports</th><th>Last reported</th></tr></thead>
              <tbody>
                {data.reports.map(r => (
                  <tr key={r.chatMessageId}>
                    <td className='quote'>“{r.text}”<div className='muted'>sent {when(r.sentAt)}</div></td>
                    <td><Link to={`/players/${r.playerId}`} className='strong'>{r.username}</Link><div><StatusBadge status={r.playerStatus} /></div></td>
                    <td className='mono'>{r.roomCode}</td>
                    <td className='num'>{r.reports}<div className='muted' title={r.reporters.join(', ')}>{r.reporters.slice(0, 2).join(', ')}{r.reporters.length > 2 ? '…' : ''}</div></td>
                    <td>{ago(r.lastReportedAt)}</td>
                  </tr>
                ))}
                {data.reports.length === 0 && <tr><td colSpan={5} className='empty'>No reports.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager count={data.count} pageNo={data.pageNo} limit={data.limit} onPage={page => setParams('/reports', params, { page })} />
        </>
      )}
    </>
  )
}
