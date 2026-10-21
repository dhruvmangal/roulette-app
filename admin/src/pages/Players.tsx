import { useEffect, useState } from 'react'
import { api, type Page, type PlayerRow } from '../api'
import { ErrorNote, Link, Loading, Pager, StatusBadge } from '../components/ui'
import { ago, chips } from '../format'
import { setParams } from '../router'
import { useApi } from '../useApi'

const SORTS = { newest: 'Newest', lastLogin: 'Last sign-in', balanceHigh: 'Balance, high to low', balanceLow: 'Balance, low to high', username: 'Username', oldest: 'Oldest' }

export function Players ({ params }: { params: URLSearchParams }) {
  const query = {
    search: params.get('search') ?? '',
    status: params.get('status') ?? '',
    kind: params.get('kind') ?? '',
    sort: params.get('sort') ?? 'newest',
    pageNo: Number(params.get('page') ?? 1),
    limit: 25
  }
  const update = (changes: Record<string, string | number | undefined>) => setParams('/players', params, { page: undefined, ...changes })

  const [search, setSearch] = useState(query.search)
  useEffect(() => setSearch(query.search), [query.search])
  useEffect(() => {
    if (search === query.search) return
    const timer = setTimeout(() => update({ search }), 300)
    return () => clearTimeout(timer)
  })

  const { data, error } = useApi(() => api<{ players: PlayerRow[] } & Page>('GET', '/players', { query }), JSON.stringify(query))

  return (
    <>
      <header className='page-head'><h1>Players</h1></header>
      <div className='filters'>
        <input type='search' placeholder='Search id, username or email' value={search} onChange={e => setSearch(e.target.value)} aria-label='Search players' />
        <select value={query.status} onChange={e => update({ status: e.target.value })} aria-label='Status'>
          <option value=''>Any status</option><option value='active'>Active</option><option value='banned'>Banned</option><option value='inactive'>Inactive</option>
        </select>
        <select value={query.kind} onChange={e => update({ kind: e.target.value })} aria-label='Account type'>
          <option value=''>Guests and registered</option><option value='registered'>Registered</option><option value='guest'>Guests</option>
        </select>
        <select value={query.sort} onChange={e => update({ sort: e.target.value })} aria-label='Sort'>
          {Object.entries(SORTS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      </div>
      {error && <ErrorNote error={error} />}
      {!data ? <Loading /> : (
        <>
          <div className='table-wrap'>
            <table className='data'>
              <thead>
                <tr><th>Player</th><th>Login</th><th>Status</th><th className='num'>Balance</th><th>Last sign-in</th><th>Joined</th></tr>
              </thead>
              <tbody>
                {data.players.map(p => (
                  <tr key={p.playerId}>
                    <td><Link to={`/players/${p.playerId}`} className='strong'>{p.username}</Link><div className='muted'>#{p.playerId}{p.email ? ` · ${p.email}` : ''}</div></td>
                    <td>{p.isGuest ? <span className='muted'>Guest</span> : p.providers.join(', ')}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className='num'>{chips(p.balance)}</td>
                    <td>{ago(p.lastLoginAt)}</td>
                    <td>{ago(p.createdAt)}</td>
                  </tr>
                ))}
                {data.players.length === 0 && <tr><td colSpan={6} className='empty'>No players match.</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager count={data.count} pageNo={data.pageNo} limit={data.limit} onPage={page => setParams('/players', params, { page })} />
        </>
      )}
    </>
  )
}
