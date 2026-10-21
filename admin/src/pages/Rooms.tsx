import { api, type Page, type Room } from '../api'
import { ErrorNote, Link, Loading, Pager } from '../components/ui'
import { ago, chips, compact, label, variantName } from '../format'
import { setParams } from '../router'
import { useApi } from '../useApi'

export function Rooms ({ params }: { params: URLSearchParams }) {
  const query = { status: params.get('status') ?? 'OPEN', mode: params.get('mode') ?? '', pageNo: Number(params.get('page') ?? 1), limit: 25 }
  const update = (changes: Record<string, string | undefined>) => setParams('/tables', params, { page: undefined, ...changes })
  const { data, error, reload, loading } = useApi(
    () => api<{ rooms: Room[] } & Page>('GET', '/rooms', { query: { ...query, status: query.status === 'ALL' ? '' : query.status } }),
    JSON.stringify(query)
  )

  return (
    <>
      <header className='page-head'>
        <h1>Tables</h1>
        <button className='btn' onClick={reload} disabled={loading}>Refresh</button>
      </header>
      <div className='filters'>
        <select value={query.status} onChange={e => update({ status: e.target.value })} aria-label='Status'>
          <option value='OPEN'>Open</option><option value='ENDED'>Ended</option><option value='ALL'>All</option>
        </select>
        <select value={query.mode} onChange={e => update({ mode: e.target.value })} aria-label='Mode'>
          <option value=''>All modes</option><option value='PUBLIC'>Public</option><option value='PRIVATE'>Private</option><option value='VS_COMPUTER'>Vs computer</option>
        </select>
      </div>
      {error && <ErrorNote error={error} />}
      {!data ? <Loading /> : (
        <>
          <div className='table-wrap'>
            <table className='data'>
              <thead>
                <tr><th>Table</th><th>Seated</th><th className='num'>Limits</th><th className='num'>Rounds</th><th className='num'>Player stakes</th><th>Last round</th></tr>
              </thead>
              <tbody>
                {data.rooms.map(r => (
                  <tr key={r.roomId}>
                    <td><span className='strong mono'>{r.code}</span><div className='muted'>{label(r.mode)} · {variantName(r.variant)}{r.hostUsername ? ` · host ${r.hostUsername}` : ''}{r.status === 'ENDED' ? ' · ended' : ''}</div></td>
                    <td>
                      {r.seated.length === 0 ? <span className='muted'>Empty</span> : r.seated.map(s => (
                        <span key={s.seat} className={`chip ${s.isBot ? 'bot' : ''} ${s.away ? 'away' : ''}`} title={s.away ? 'Away' : undefined}>
                          {s.playerId ? <Link to={`/players/${s.playerId}`}>{s.username}</Link> : `${s.username} (bot)`}
                        </span>
                      ))}
                      <div className='muted'>{r.seated.length}/{r.maxSeats} seats</div>
                    </td>
                    <td className='num'>{chips(r.minBet)}–{compact(r.maxBet)}</td>
                    <td className='num'>{r.rounds}{r.totalRounds ? ` / ${r.totalRounds}` : ''}</td>
                    <td className='num'>{compact(r.staked)}</td>
                    <td>{ago(r.lastRoundAt)}</td>
                  </tr>
                ))}
                {data.rooms.length === 0 && <tr><td colSpan={6} className='empty'>No tables.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager count={data.count} pageNo={data.pageNo} limit={data.limit} onPage={page => setParams('/tables', params, { page })} />
        </>
      )}
    </>
  )
}
