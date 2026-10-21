import { api, type Page, type Referral, type ReferralTotals } from '../api'
import { ErrorNote, Link, Loading, Pager, StatTile, StatusBadge } from '../components/ui'
import { ago, chips, label, plural, when } from '../format'
import { setParams } from '../router'
import { useApi } from '../useApi'

// Keep in step with the server's referral rules (backend referral.constants.js).
const ROUNDS_REQUIRED = 10

const REJECT_REASONS: Record<string, string> = {
  SAME_DEVICE: 'The friend played on a device the referrer has used'
}

function Outcome ({ r }: { r: Referral }) {
  if (r.status === 'REWARDED') {
    return <>
      <span className='badge badge-active'>✓ Rewarded</span>
      <div className='muted'>{chips(r.referrerReward)} to referrer · {chips(r.refereeReward)} to friend{r.referrerReward === 0 ? ' (referrer at cap)' : ''} · {ago(r.rewardedAt)}</div>
    </>
  }
  if (r.status === 'REJECTED') {
    return <>
      <span className='badge badge-banned'>⊘ Rejected</span>
      <div className='muted' title={REJECT_REASONS[r.rejectReason ?? ''] ?? undefined}>{label(r.rejectReason ?? 'unknown')}</div>
    </>
  }
  return <>
    <span className='badge badge-inactive'>◌ Pending</span>
    <div className='muted'>{r.refereeSaved ? 'Account saved' : 'Still a guest'} · {Math.min(r.refereeRounds, ROUNDS_REQUIRED)}/{ROUNDS_REQUIRED} rounds</div>
  </>
}

export function Referrals ({ params }: { params: URLSearchParams }) {
  const query = { status: params.get('status') ?? '', playerId: params.get('player') ?? '', pageNo: Number(params.get('page') ?? 1), limit: 25 }
  const update = (changes: Record<string, string | undefined>) => setParams('/referrals', params, { page: undefined, ...changes })
  const { data, error, reload, loading } = useApi(
    () => api<{ referrals: Referral[], totals: ReferralTotals } & Page>('GET', '/referrals', { query }),
    JSON.stringify(query)
  )

  return (
    <>
      <header className='page-head'>
        <h1>Referrals</h1>
        <button className='btn' onClick={reload} disabled={loading}>Refresh</button>
      </header>
      <p className='muted lead'>Friends who joined with a player's code. Both sides are paid once the friend saves their account and plays {ROUNDS_REQUIRED} online rounds. Rejected ones shared a device with the referrer.</p>
      {data && (
        <section className='tiles'>
          <StatTile label='Referrals' value={data.totals.total} note={`${plural(data.totals.referrers, 'referrer')}`} />
          <StatTile label='Rewarded' value={data.totals.rewarded} />
          <StatTile label='Pending' value={data.totals.pending} />
          <StatTile label='Rejected' value={data.totals.rejected} note={data.totals.total ? `${Math.round(data.totals.rejected / data.totals.total * 100)}% of all` : undefined} />
          <StatTile label='Chips paid out' value={chips(data.totals.chipsPaid)} />
        </section>
      )}
      <div className='filters'>
        <select value={query.status} onChange={e => update({ status: e.target.value })} aria-label='Status'>
          <option value=''>All statuses</option><option value='PENDING'>Pending</option><option value='REWARDED'>Rewarded</option><option value='REJECTED'>Rejected</option>
        </select>
        {query.playerId && <button className='btn small' onClick={() => update({ player: undefined })}>Showing player #{query.playerId} ✕</button>}
      </div>
      {error && <ErrorNote error={error} />}
      {!data ? <Loading /> : (
        <>
          <div className='table-wrap'>
            <table className='data'>
              <thead><tr><th>Referrer</th><th>Friend</th><th>Outcome</th><th>Code</th><th>Joined</th></tr></thead>
              <tbody>
                {data.referrals.map(r => (
                  <tr key={r.referralId}>
                    <td><Link to={`/players/${r.referrerId}`} className='strong'>{r.referrerUsername}</Link><div><StatusBadge status={r.referrerStatus} /></div></td>
                    <td><Link to={`/players/${r.refereeId}`} className='strong'>{r.refereeUsername}</Link><div><StatusBadge status={r.refereeStatus} /></div></td>
                    <td><Outcome r={r} /></td>
                    <td className='mono'>{r.code}</td>
                    <td title={when(r.createdAt)}>{ago(r.createdAt)}</td>
                  </tr>
                ))}
                {data.referrals.length === 0 && <tr><td colSpan={5} className='empty'>No referrals{query.status || query.playerId ? ' match.' : ' yet.'}</td></tr>}
              </tbody>
            </table>
          </div>
          <Pager count={data.count} pageNo={data.pageNo} limit={data.limit} onPage={page => setParams('/referrals', params, { page })} />
        </>
      )}
    </>
  )
}
