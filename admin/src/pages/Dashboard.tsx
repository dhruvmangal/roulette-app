import { api, type Stats } from '../api'
import { BarChart } from '../components/BarChart'
import { ErrorNote, Link, Loading, StatTile } from '../components/ui'
import { chips, compact, day, plural, signed } from '../format'
import { useApi } from '../useApi'

const BLUE = 'var(--series-1)'
const ORANGE = 'var(--series-2)'
const RED = 'var(--diverging-neg)'

export function Dashboard () {
  const { data, error, loading, reload } = useApi(() => api<Stats>('GET', '/stats', { query: { days: 14 } }), 'stats')

  if (!data) return error ? <ErrorNote error={error} /> : <Loading />
  const { players, chips: wallet, last24h, tables, series } = data

  return (
    <>
      <header className='page-head'>
        <h1>Dashboard</h1>
        <button className='btn' onClick={reload} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </header>

      <section className='hero'>
        <div className='hero-label'>House net, last 24 hours</div>
        <div className='hero-value'>{signed(last24h.houseNet)} <span className='unit'>chips</span></div>
        <div className='hero-note'>
          {chips(last24h.staked)} staked, {chips(last24h.paid)} paid out and {chips(last24h.refunded)} refunded, by {plural(last24h.bettors, 'player')}
        </div>
      </section>

      <section className='tiles'>
        <StatTile label='Players' value={compact(players.total)} note={<>{players.newToday} new today · {players.guests} guests</>} />
        <StatTile label='Signed in today' value={compact(players.activeToday)} note={<Link to='/players?sort=lastLogin'>Recently active</Link>} />
        <StatTile label='Chips in wallets' value={compact(wallet.inCirculation)} note={plural(wallet.wallets, 'wallet')} />
        <StatTile label='Bonuses paid, 24h' value={compact(last24h.bonuses)} note={`Admin adjustments ${signed(last24h.adminAdjusted)}`} />
        <StatTile label='Open tables' value={tables.open} note={`${plural(tables.seatedPlayers, 'player')} seated · ${plural(tables.roundsToday, 'round')} today`} />
        <StatTile label='Banned' value={players.banned} note={<Link to='/players?status=banned'>View banned</Link>} />
      </section>

      <section className='charts'>
        <BarChart
          title='Chips staked and paid out'
          subtitle='Per day, last 14 days'
          rows={series as unknown as Array<Record<string, number | string>>}
          category='date'
          formatCategory={day}
          series={[{ key: 'staked', label: 'Staked', color: BLUE }, { key: 'paid', label: 'Paid out', color: ORANGE }]}
        />
        <BarChart
          title='House net per day'
          subtitle='Stakes minus payouts and refunds; below zero means players won'
          rows={series as unknown as Array<Record<string, number | string>>}
          category='date'
          formatCategory={day}
          series={[{ key: 'houseNet', label: 'House net', color: BLUE }]}
          negativeColor={RED}
        />
        <BarChart
          title='New players per day'
          rows={series as unknown as Array<Record<string, number | string>>}
          category='date'
          formatCategory={day}
          series={[{ key: 'signups', label: 'New players', color: BLUE }]}
        />
      </section>
    </>
  )
}
