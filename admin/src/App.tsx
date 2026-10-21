import { useEffect, useState } from 'react'
import { api, auth, type Admin } from './api'
import { Link, Loading } from './components/ui'
import { AuditLog } from './pages/AuditLog'
import { Bonuses } from './pages/Bonuses'
import { ChatReports } from './pages/ChatReports'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { PlayerDetail } from './pages/PlayerDetail'
import { Notifications } from './pages/Notifications'
import { Players } from './pages/Players'
import { Referrals } from './pages/Referrals'
import { Rooms } from './pages/Rooms'
import { Transactions } from './pages/Transactions'
import { navigate, splitLocation, useLocation } from './router'

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/players', label: 'Players' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/referrals', label: 'Referrals' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/tables', label: 'Tables' },
  { to: '/bonuses', label: 'Bonuses' },
  { to: '/reports', label: 'Chat reports' },
  { to: '/audit', label: 'Audit log' }
]

function Page ({ path, params }: { path: string, params: URLSearchParams }) {
  const player = path.match(/^\/players\/(\d+)$/)
  if (player) return <PlayerDetail key={player[1]} playerId={Number(player[1])} />
  switch (path) {
    case '/': return <Dashboard />
    case '/players': return <Players params={params} />
    case '/transactions': return <Transactions params={params} />
    case '/referrals': return <Referrals params={params} />
    case '/notifications': return <Notifications params={params} />
    case '/tables': return <Rooms params={params} />
    case '/bonuses': return <Bonuses />
    case '/reports': return <ChatReports params={params} />
    case '/audit': return <AuditLog params={params} />
    default: return <div className='empty'>Page not found. <Link to='/'>Go to the dashboard</Link></div>
  }
}

export function App () {
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [checking, setChecking] = useState(Boolean(auth.token))
  const location = useLocation()
  const { path, params } = splitLocation(location)

  useEffect(() => {
    auth.onSignedOut(() => setAdmin(null))
    if (!auth.token) return
    api<{ admin: Admin }>('GET', '/auth/me')
      .then(({ admin }) => setAdmin(admin))
      .catch(() => auth.set(null))
      .finally(() => setChecking(false))
  }, [])

  if (checking) return <Loading />
  if (!admin) return <Login onSignedIn={setAdmin} />

  const signOut = async () => {
    await api('POST', '/auth/logout').catch(() => {})
    auth.set(null)
    setAdmin(null)
    navigate('/')
  }

  const section = '/' + (path.split('/')[1] ?? '')

  return (
    <div className='shell'>
      <nav className='sidebar'>
        <div className='brand'><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt='' width={24} height={24} /> Roulette Admin</div>
        <ul>
          {NAV.map(item => (
            <li key={item.to}><Link to={item.to} className={section === item.to ? 'active' : ''}>{item.label}</Link></li>
          ))}
        </ul>
        <div className='me'>
          <div className='strong'>{admin.name}</div>
          <div className='muted'>{admin.email}</div>
          <button className='btn small' onClick={signOut}>Sign out</button>
        </div>
      </nav>
      <main className='content'><Page path={path} params={params} /></main>
    </div>
  )
}
