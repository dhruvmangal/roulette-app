import { useEffect, useState, type FormEvent } from 'react'
import { api, errorText, type Announcement, type AnnouncementReach, type AuditLog, type Device, type Page, type PlayerDetail as Detail, type PlayerStatus, type Transaction } from '../api'
import { ErrorNote, Link, Loading, Modal, StatTile, StatusBadge } from '../components/ui'
import { ago, chips, compact, label, plural, signed, when } from '../format'
import { useApi } from '../useApi'
import { TransactionsTable } from './Transactions'

// randomUUID needs a secure context (https or localhost); getRandomValues does not.
const newRequestId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')

const regionNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }) } catch { return null } })()
const countryName = (code: string | null) => (code ? regionNames?.of(code) ?? code : null)
const place = (v: { city: string | null, region: string | null, country: string | null }) =>
  [v.city, v.region, countryName(v.country)].filter(Boolean).join(', ') || '—'

function deviceName (d: Device) {
  const model = [d.deviceVendor, d.deviceModel].filter(Boolean).join(' ')
  const system = [d.osName, d.osVersion].filter(Boolean).join(' ')
  const app = d.platform === 'web' ? [d.browserName, d.browserVersion?.split('.')[0]].filter(Boolean).join(' ') : `${label(d.platform)} app ${d.appVersion ?? ''}`.trim()
  return { title: model || label(d.deviceType ?? d.platform), detail: [system, app].filter(Boolean).join(' · ') }
}

function AdjustWallet ({ playerId, balance, onDone, onClose }: { playerId: number, balance: number, onDone: () => void, onClose: () => void }) {
  const [direction, setDirection] = useState<'CREDIT' | 'DEBIT'>('CREDIT')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // One id per open dialog: a retried or double-clicked submit moves chips once.
  const [requestId] = useState(newRequestId)
  const value = Number(amount)
  const after = direction === 'CREDIT' ? balance + value : balance - value

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('POST', `/players/${playerId}/wallet/adjust`, { body: { direction, amount: value, reason: reason.trim(), requestId } })
      onDone()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Modal title='Adjust chips' onClose={onClose}>
      <form className='form' onSubmit={submit}>
        <div className='segmented' role='radiogroup' aria-label='Direction'>
          {(['CREDIT', 'DEBIT'] as const).map(d => (
            <button key={d} type='button' role='radio' aria-checked={direction === d} className={direction === d ? 'on' : ''} onClick={() => setDirection(d)}>
              {d === 'CREDIT' ? 'Add chips' : 'Remove chips'}
            </button>
          ))}
        </div>
        <label>Amount<input inputMode='numeric' required value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ''))} autoFocus /></label>
        <label><span>Reason <span className='muted'>(saved on the ledger and in the audit log)</span></span>
          <textarea required minLength={3} maxLength={500} rows={3} value={reason} onChange={e => setReason(e.target.value)} />
        </label>
        <div className='muted'>Balance {chips(balance)} → <strong className={after < 0 ? 'debit' : ''}>{value ? chips(after) : '—'}</strong></div>
        {error && <ErrorNote error={error} />}
        <div className='form-actions'>
          <button type='button' className='btn' onClick={onClose}>Cancel</button>
          <button className='btn primary' disabled={busy || !value || after < 0 || reason.trim().length < 3}>{busy ? 'Saving…' : 'Apply'}</button>
        </div>
      </form>
    </Modal>
  )
}

/** Sends one notification to this player's phones and reports how it went: the way to check push works end to end. */
function SendTestPush ({ playerId, username, onClose }: { playerId: number, username: string, onClose: () => void }) {
  const [title, setTitle] = useState('Test notification')
  const [body, setBody] = useState('This is a test from the Roulette admin.')
  const [reach, setReach] = useState<AnnouncementReach | null>(null)
  const [result, setResult] = useState<Announcement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [requestId] = useState(newRequestId)

  useEffect(() => {
    api<AnnouncementReach>('GET', '/announcements/reach', { query: { audience: 'PLAYER', playerId } }).then(setReach, e => setError(errorText(e)))
  }, [playerId])

  const off = reach !== null && !reach.configured.android && !reach.configured.ios
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { announcement } = await api<{ announcement: Announcement }>('POST', '/announcements', { body: { title: title.trim(), body: body.trim(), audience: 'PLAYER', playerId, requestId } })
      setResult(announcement)
    } catch (err) {
      setError(errorText(err))
    }
    setBusy(false)
  }

  return (
    <Modal title={`Send a test push to ${username}`} onClose={onClose}>
      <form className='form' onSubmit={submit}>
        {off && <div className='warn-note'>Push isn't set up on the server yet (see the Notifications page).</div>}
        {reach && !off && (reach.phones > 0
          ? <div className='muted'>{plural(reach.phones, 'phone')} set up to receive it.</div>
          : <div className='warn-note'>This player can't be reached: {reach.unreachable === 'opted-out' ? 'they turned announcements off' : reach.unreachable === 'no-devices' ? 'no phone is set up (they have to allow notifications in the app)' : reach.unreachable ?? 'unknown'}.</div>)}
        <label>Title<input value={title} maxLength={65} required onChange={e => setTitle(e.target.value)} /></label>
        <label>Message<textarea value={body} maxLength={178} rows={3} required onChange={e => setBody(e.target.value)} /></label>
        {result && <div className={result.sent > 0 ? 'notice' : 'warn-note'} role='status'>{result.sent > 0 ? `Delivered to ${plural(result.sent, 'phone')}.` : 'Nothing was delivered: no phone could be reached.'}</div>}
        {error && <ErrorNote error={error} />}
        <div className='form-actions'>
          <button type='button' className='btn' onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
          {!result && <button className='btn primary' disabled={busy || off || !title.trim() || !body.trim()}>{busy ? 'Sending…' : 'Send test'}</button>}
        </div>
      </form>
    </Modal>
  )
}

function ChangeStatus ({ playerId, status, onDone, onClose }: { playerId: number, status: PlayerStatus, onDone: () => void, onClose: () => void }) {
  const [next, setNext] = useState<PlayerStatus>(status === 'active' ? 'banned' : 'active')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api('PATCH', `/players/${playerId}/status`, { body: { status: next, reason: reason.trim() } })
      onDone()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Modal title='Change status' onClose={onClose}>
      <form className='form' onSubmit={submit}>
        <label>New status
          <select value={next} onChange={e => setNext(e.target.value as PlayerStatus)}>
            {(['active', 'banned', 'inactive'] as const).filter(s => s !== status).map(s => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </label>
        {next !== 'active' && <div className='warn-note'>This signs the player out on every device and drops their table connections.</div>}
        <label>Reason<textarea required minLength={3} maxLength={500} rows={3} value={reason} onChange={e => setReason(e.target.value)} autoFocus /></label>
        {error && <ErrorNote error={error} />}
        <div className='form-actions'>
          <button type='button' className='btn' onClick={onClose}>Cancel</button>
          <button className={`btn ${next === 'active' ? 'primary' : 'danger'}`} disabled={busy || reason.trim().length < 3}>{busy ? 'Saving…' : 'Confirm'}</button>
        </div>
      </form>
    </Modal>
  )
}

export function PlayerDetail ({ playerId }: { playerId: number }) {
  const detail = useApi(() => api<Detail>('GET', `/players/${playerId}`), `player:${playerId}`)
  const ledger = useApi(() => api<{ transactions: Transaction[] } & Page>('GET', '/transactions', { query: { playerId, limit: 20 } }), `ledger:${playerId}`)
  const audit = useApi(() => api<{ logs: AuditLog[] }>('GET', '/audit-logs', { query: { targetType: 'PLAYER', targetId: String(playerId), limit: 10 } }), `audit:${playerId}`)
  const [dialog, setDialog] = useState<'adjust' | 'status' | 'push' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = (message: string) => {
    setDialog(null)
    setNotice(message)
    detail.reload(); ledger.reload(); audit.reload()
  }

  const logout = async () => {
    try {
      await api('POST', `/players/${playerId}/logout`)
      refresh('Signed out on every device.')
    } catch (err) {
      setNotice(errorText(err))
    }
  }

  if (!detail.data) return detail.error ? <ErrorNote error={detail.error} /> : <Loading />
  const { player, wallet, identities, stats, seats, devices, visits, linkedAccounts, referrals } = detail.data

  return (
    <>
      <div className='crumbs'><Link to='/players'>Players</Link> / #{player.playerId}</div>
      <header className='page-head'>
        <div>
          <h1>{player.username} <StatusBadge status={player.status} /></h1>
          <div className='muted'>{player.isGuest ? 'Guest' : player.providers.join(' and ')}{player.email ? ` · ${player.email}` : ''} · joined {when(player.createdAt)}</div>
        </div>
        <div className='actions'>
          <button className='btn primary' disabled={!wallet} onClick={() => setDialog('adjust')}>Adjust chips</button>
          <button className='btn' onClick={() => setDialog('push')}>Send test push</button>
          <button className='btn' onClick={() => setDialog('status')}>{player.status === 'active' ? 'Ban or deactivate' : 'Change status'}</button>
          <button className='btn' onClick={logout} disabled={stats.activeSessions === 0}>Sign out everywhere</button>
        </div>
      </header>
      {notice && <div className='notice' role='status'>{notice}</div>}

      <section className='tiles'>
        <StatTile label='Balance' value={chips(wallet?.balance)} note={wallet ? `Wallet #${wallet.walletId}, version ${wallet.version}` : 'No wallet'} />
        <StatTile label='Net from play' value={signed(stats.net)} note={`${compact(stats.staked)} staked over ${plural(stats.rounds, 'round')}`} />
        <StatTile label='Biggest win' value={compact(stats.biggestWin)} note={`Last bet ${ago(stats.lastBetAt)}`} />
        <StatTile label='Bonuses received' value={compact(stats.bonuses)} note={`Admin adjustments ${signed(stats.adminAdjusted)}`} />
        <StatTile label='Active sessions' value={stats.activeSessions} note={`Last sign-in ${ago(player.lastLoginAt)}`} />
      </section>

      <div className='two-col'>
        <section className='panel'>
          <h2>Linked logins</h2>
          {identities.length === 0 ? <p className='muted'>None. A guest can only come back on the device they played on.</p> : (
            <ul className='plain'>
              {identities.map(i => <li key={i.provider}><strong>{label(i.provider)}</strong> {i.email ?? <span className='muted'>no email</span>} <span className='muted'>· used {ago(i.lastUsedAt)}</span></li>)}
            </ul>
          )}
        </section>
        <section className='panel'>
          <h2>Seated at</h2>
          {seats.length === 0 ? <p className='muted'>Not at any open table.</p> : (
            <ul className='plain'>
              {seats.map(s => <li key={s.roomId}><strong>{s.code}</strong> {label(s.mode)}, seat {s.seat} <span className='muted'>· {s.awaySince ? `away ${ago(s.awaySince)}` : 'connected'}</span></li>)}
            </ul>
          )}
        </section>
      </div>

      {referrals && (referrals.referredBy || referrals.made > 0) && (
        <section className='panel section'>
          <h2>Referrals</h2>
          <ul className='plain'>
            {referrals.referredBy && (
              <li>Joined with <Link to={`/players/${referrals.referredBy.playerId}`} className='strong'>{referrals.referredBy.username}</Link>'s code <span className='muted'>· {label(referrals.referredBy.status)}{referrals.referredBy.rejectReason ? `, ${label(referrals.referredBy.rejectReason)}` : ''}</span></li>
            )}
            {referrals.made > 0 && (
              <li>Referred {plural(referrals.made, 'friend')}, {referrals.rewarded} rewarded, {chips(referrals.earned)} chips earned <span className='muted'>· code {referrals.code} · </span><Link to={`/referrals?player=${player.playerId}`}>See them</Link></li>
            )}
          </ul>
        </section>
      )}

      <section className='section'>
        <h2>Other accounts on the same device or network</h2>
        {linkedAccounts.length === 0 ? <p className='muted'>None seen.</p> : (
          <div className='table-wrap'>
            <table className='data'>
              <thead><tr><th>Player</th><th>Status</th><th>Seen sharing</th></tr></thead>
              <tbody>
                {linkedAccounts.map(a => (
                  <tr key={a.playerId}>
                    <td><Link to={`/players/${a.playerId}`} className='strong'>{a.username}</Link><div className='muted'>#{a.playerId}{a.isGuest ? ' · guest' : ''}</div></td>
                    <td><StatusBadge status={a.status} /></td>
                    <td>{a.via.includes('device') ? <strong>Same device</strong> : 'Same IP address'}{a.via.length > 1 && ' and IP address'} <span className='muted'>· {a.matches} {a.matches === 1 ? 'match' : 'matches'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className='muted small-note'>Same IP address alone is a weak hint: households, offices and mobile networks share addresses.</p>
      </section>

      <section className='section'>
        <h2>Devices</h2>
        {devices.length === 0 ? <p className='muted'>No devices reported yet. They are recorded at sign-in.</p> : (
          <div className='table-wrap'>
            <table className='data'>
              <thead><tr><th>Device</th><th>Screen</th><th>Language · time zone</th><th className='num'>Visits</th><th>First seen</th><th>Last seen</th></tr></thead>
              <tbody>
                {devices.map(d => {
                  const name = deviceName(d)
                  return (
                    <tr key={d.playerDeviceId}>
                      <td><span className='strong'>{name.title}</span>{d.isVirtual && <span className='badge badge-inactive'>emulator</span>}<div className='muted'>{name.detail}</div><div className='muted mono' title='Install id'>{d.deviceId.slice(0, 12)}…</div></td>
                      <td className='nowrap'>{d.screenWidth && d.screenHeight ? `${d.screenWidth}×${d.screenHeight}` : '—'}{d.pixelRatio ? <span className='muted'> @{d.pixelRatio}x</span> : null}</td>
                      <td>{d.language ?? '—'}<div className='muted'>{d.timezone ?? ''}</div></td>
                      <td className='num'>{d.visits}</td>
                      <td>{when(d.firstSeenAt)}</td>
                      <td>{ago(d.lastSeenAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className='section'>
        <h2>Recent visits</h2>
        {visits.length === 0 ? <p className='muted'>None yet.</p> : (
          <div className='table-wrap'>
            <table className='data'>
              <thead><tr><th>When</th><th>Approximate place</th><th>IP address</th><th>Network</th><th>Orientation</th><th>Device</th></tr></thead>
              <tbody>
                {visits.map(v => (
                  <tr key={v.playerVisitId}>
                    <td className='nowrap'>{when(v.createdAt)}</td>
                    <td>{place(v)}{v.latitude != null && v.longitude != null && <div><a className='muted' href={`https://www.openstreetmap.org/?mlat=${v.latitude}&mlon=${v.longitude}#map=10/${v.latitude}/${v.longitude}`} target='_blank' rel='noreferrer'>Map ↗</a></div>}</td>
                    <td className='mono'>{v.ip ?? '—'}</td>
                    <td>{v.networkType ? label(v.networkType) : '—'}{v.networkQuality && <div className='muted'>{v.networkQuality.toUpperCase()}</div>}</td>
                    <td>{v.orientation ? label(v.orientation.split('-')[0]) : '—'}</td>
                    <td>{[v.deviceModel, v.osName, v.browserName].filter(Boolean).join(' · ') || label(v.platform)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className='muted small-note'>Places come from the IP address (IP geolocation by <a href='https://db-ip.com' target='_blank' rel='noreferrer'>DB-IP</a>) and are often only right to the city or region. Visits are kept for 90 days.</p>
      </section>

      <section className='section'>
        <div className='section-head'>
          <h2>Recent transactions</h2>
          <Link to={`/transactions?playerId=${player.playerId}`}>All {stats.transactions.toLocaleString()}</Link>
        </div>
        {ledger.data ? <TransactionsTable rows={ledger.data.transactions} showPlayer={false} /> : <Loading />}
      </section>

      <section className='section'>
        <h2>Admin history</h2>
        {audit.data && audit.data.logs.length > 0 ? (
          <ul className='timeline'>
            {audit.data.logs.map(log => (
              <li key={log.adminAuditLogId}>
                <span className='muted'>{when(log.createdAt)}</span> <strong>{label(log.action)}</strong> by {log.adminEmail}
                {typeof log.details.reason === 'string' && <> — “{log.details.reason}”</>}
              </li>
            ))}
          </ul>
        ) : <p className='muted'>No admin changes.</p>}
      </section>

      {dialog === 'adjust' && wallet && <AdjustWallet playerId={playerId} balance={wallet.balance} onClose={() => setDialog(null)} onDone={() => refresh('Chips adjusted.')} />}
      {dialog === 'push' && <SendTestPush playerId={playerId} username={player.username} onClose={() => setDialog(null)} />}
      {dialog === 'status' && <ChangeStatus playerId={playerId} status={player.status} onClose={() => setDialog(null)} onDone={() => refresh('Status updated.')} />}
    </>
  )
}
