import { useEffect, useState, type FormEvent } from 'react'
import {
  ANNOUNCEMENT_LIMITS, api, errorText, newRequestId, type Announcement, type AnnouncementAudience, type AnnouncementReach, type Page
} from '../api'
import { ErrorNote, Link, Loading, Modal, Pager } from '../components/ui'
import { ago, label, plural, when } from '../format'
import { setParams } from '../router'
import { useApi } from '../useApi'

const SKIP_REASONS: Record<string, string> = {
  'opted-out': 'turned announcements off',
  'no-devices': 'no phone set up',
  duplicate: 'already sent',
  'not-configured': 'push not set up',
  'no-player': 'no such player',
  error: 'failed'
}
const reason = (key: string) => SKIP_REASONS[key] ?? label(key.replace(/-/g, '_'))

export const audienceText = (a: Pick<Announcement, 'audience' | 'audienceDays' | 'audiencePlayerId'>) =>
  a.audience === 'ALL' ? 'Everyone' : a.audience === 'INACTIVE' ? `Away ${a.audienceDays}+ days` : `Player #${a.audiencePlayerId}`

/** The notification roughly as it looks on a lock screen. */
function Preview ({ title, body }: { title: string, body: string }) {
  return (
    <div className='push-preview' aria-label='Preview'>
      <div className='push-app'>Roulette · now</div>
      <strong>{title || 'Title'}</strong>
      <div>{body || 'Your message appears here.'}</div>
    </div>
  )
}

function Confirm ({ draft, reach, onClose, onSent }: {
  draft: { title: string, body: string, audience: AnnouncementAudience, days: number | null, playerId: number | null }
  reach: AnnouncementReach, onClose: () => void, onSent: (a: Announcement) => void
}) {
  // One id for this dialog: opening it twice is two announcements, clicking Send twice is one.
  const [requestId] = useState(newRequestId)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      const body = { title: draft.title.trim(), body: draft.body.trim(), audience: draft.audience, requestId, ...(draft.days ? { days: draft.days } : {}), ...(draft.playerId ? { playerId: draft.playerId } : {}) }
      const { announcement } = await api<{ announcement: Announcement }>('POST', '/announcements', { body })
      onSent(announcement)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Modal title='Send this notification?' onClose={onClose}>
      <div className='form'>
        <Preview title={draft.title.trim()} body={draft.body.trim()} />
        <p>
          This goes to <strong>{plural(reach.players, 'player')}</strong> on <strong>{plural(reach.phones, 'phone')}</strong> ({audienceText({ audience: draft.audience, audienceDays: draft.days, audiencePlayerId: draft.playerId }).toLowerCase()}).
          It can't be recalled once sent.
        </p>
        {error && <ErrorNote error={error} />}
        <div className='form-actions'>
          <button type='button' className='btn' onClick={onClose}>Cancel</button>
          <button className='btn primary' onClick={send} disabled={busy}>{busy ? 'Sending…' : `Send to ${plural(reach.players, 'player')}`}</button>
        </div>
      </div>
    </Modal>
  )
}

export function Notifications ({ params }: { params: URLSearchParams }) {
  const pageNo = Number(params.get('page') ?? 1)
  const history = useApi(() => api<{ announcements: Announcement[] } & Page>('GET', '/announcements', { query: { pageNo, limit: 15 } }), `announcements:${pageNo}`)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<AnnouncementAudience>('ALL')
  const [days, setDays] = useState('7')
  const [playerId, setPlayerId] = useState('')
  const [reach, setReach] = useState<AnnouncementReach | null>(null)
  const [reachError, setReachError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const daysNumber = Number(days)
  const playerNumber = Number(playerId)
  const audienceReady = audience === 'ALL' || (audience === 'INACTIVE' && daysNumber >= 1 && daysNumber <= 365) || (audience === 'PLAYER' && playerNumber >= 1)

  // Who it would reach, refreshed shortly after the audience changes.
  useEffect(() => {
    setReach(null)
    setReachError(null)
    if (!audienceReady) return
    const timer = window.setTimeout(() => {
      api<AnnouncementReach>('GET', '/announcements/reach', {
        query: { audience, ...(audience === 'INACTIVE' ? { days: daysNumber } : {}), ...(audience === 'PLAYER' ? { playerId: playerNumber } : {}) }
      }).then(setReach, error => setReachError(errorText(error)))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [audience, daysNumber, playerNumber, audienceReady])

  // While something is going out, keep the history fresh.
  const sending = history.data?.announcements.some(a => a.status === 'SENDING' && !a.stalled)
  useEffect(() => {
    if (!sending) return
    const timer = window.setInterval(history.reload, 3000)
    return () => window.clearInterval(timer)
  }, [sending, history.reload])

  const configured = reach?.configured
  const pushOff = configured !== undefined && !configured.android && !configured.ios
  const validText = title.trim().length > 0 && body.trim().length > 0
  const canSend = validText && audienceReady && reach !== null && !pushOff && (audience === 'PLAYER' || reach.players > 0)

  const submit = (event: FormEvent) => { event.preventDefault(); if (canSend) setConfirming(true) }

  return (
    <>
      <header className='page-head'><h1>Notifications</h1></header>
      <p className='muted lead'>Send a push notification to players' phones. Players who are in the game right now see it in the app instead, and anyone can switch announcements off in Settings. Every send is recorded in the audit log.</p>

      {pushOff && <div className='warn-note' role='alert'>Push notifications aren't set up on the server, so nothing can be sent yet. Set <code>FCM_SERVICE_ACCOUNT_JSON</code> for Android, and <code>APNS_KEY</code>, <code>APNS_KEY_ID</code> and <code>APNS_TEAM_ID</code> for iPhone (see mobile/README.md).</div>}
      {notice && <div className='notice' role='status'>{notice}</div>}

      <div className='two-col'>
        <form className='panel form' onSubmit={submit}>
          <h2>New notification</h2>
          <label>Title <span className='muted'>({title.length}/{ANNOUNCEMENT_LIMITS.title})</span>
            <input value={title} maxLength={ANNOUNCEMENT_LIMITS.title} onChange={e => setTitle(e.target.value)} placeholder='Double chips this weekend' required />
          </label>
          <label>Message <span className='muted'>({body.length}/{ANNOUNCEMENT_LIMITS.body})</span>
            <textarea value={body} maxLength={ANNOUNCEMENT_LIMITS.body} rows={3} onChange={e => setBody(e.target.value)} placeholder='Claim your daily bonus before Monday.' required />
          </label>
          <label>Send to
            <select value={audience} onChange={e => setAudience(e.target.value as AnnouncementAudience)}>
              <option value='ALL'>Every player with a phone set up</option>
              <option value='INACTIVE'>Players who have been away</option>
              <option value='PLAYER'>One player</option>
            </select>
          </label>
          {audience === 'INACTIVE' && <label>Away for at least (days)<input inputMode='numeric' value={days} onChange={e => setDays(e.target.value.replace(/\D/g, ''))} /></label>}
          {audience === 'PLAYER' && <label>Player id<input inputMode='numeric' value={playerId} onChange={e => setPlayerId(e.target.value.replace(/\D/g, ''))} placeholder='e.g. 51' /></label>}

          <div className='reach' role='status'>
            {!audienceReady ? <span className='muted'>Choose who to send to.</span>
              : reachError ? <ErrorNote error={reachError} />
                : !reach ? <span className='muted'>Checking who this reaches…</span>
                  : reach.players > 0 ? <span>Reaches <strong>{plural(reach.players, 'player')}</strong> on <strong>{plural(reach.phones, 'phone')}</strong>.</span>
                    : <span className='warn-note'>{audience === 'PLAYER' && reach.unreachable ? `This player can't be reached: ${reason(reach.unreachable)}.` : 'Nobody matches: no one in this group has a phone set up and announcements on.'}</span>}
          </div>
          <div className='form-actions'>
            <button className='btn primary' disabled={!canSend}>Review and send</button>
          </div>
        </form>

        <section className='panel'>
          <h2>Preview</h2>
          <Preview title={title.trim()} body={body.trim()} />
          <p className='muted small-note'>Android and iPhone shorten long text on the lock screen, so the limits are short. The same words go to every language: write it so it reads well to everyone, or pick a smaller group.</p>
        </section>
      </div>

      {confirming && reach && (
        <Confirm
          draft={{ title, body, audience, days: audience === 'INACTIVE' ? daysNumber : null, playerId: audience === 'PLAYER' ? playerNumber : null }}
          reach={reach}
          onClose={() => setConfirming(false)}
          onSent={a => {
            setConfirming(false)
            setTitle('')
            setBody('')
            setNotice(a.audience === 'PLAYER' ? `Sent to player #${a.audiencePlayerId}: ${plural(a.sent, 'phone')} reached.` : `Sending to ${plural(a.targeted, 'player')} now. The history below updates as it goes.`)
            history.reload()
          }}
        />
      )}

      <section className='section'>
        <h2>Sent</h2>
        {history.error && <ErrorNote error={history.error} />}
        {!history.data ? <Loading /> : (
          <>
            <div className='table-wrap'>
              <table className='data'>
                <thead><tr><th>Message</th><th>To</th><th className='num'>Reached</th><th>Status</th><th>Sent by</th></tr></thead>
                <tbody>
                  {history.data.announcements.map(a => (
                    <tr key={a.announcementId}>
                      <td><span className='strong'>{a.title}</span><div className='muted'>{a.body}</div></td>
                      <td>{a.audience === 'PLAYER' ? <Link to={`/players/${a.audiencePlayerId}`}>{audienceText(a)}</Link> : audienceText(a)}</td>
                      <td className='num'>
                        {a.sent.toLocaleString()} <span className='muted'>of {plural(a.targeted, 'player')}</span>
                        {Object.keys(a.skipped).length > 0 && <div className='muted'>{Object.entries(a.skipped).map(([k, v]) => `${v} ${reason(k)}`).join(' · ')}</div>}
                      </td>
                      <td>
                        <span className={`badge ${a.status === 'SENT' ? 'badge-active' : a.status === 'FAILED' || a.stalled ? 'badge-banned' : 'badge-inactive'}`}>
                          {a.stalled ? 'Interrupted' : a.status === 'SENDING' ? 'Sending…' : label(a.status)}
                        </span>
                        {a.error && <div className='muted'>{a.error}</div>}
                      </td>
                      <td><span title={when(a.createdAt)}>{a.adminName}</span><div className='muted'>{ago(a.createdAt)}</div></td>
                    </tr>
                  ))}
                  {history.data.announcements.length === 0 && <tr><td colSpan={5} className='empty'>Nothing sent yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <Pager count={history.data.count} pageNo={history.data.pageNo} limit={history.data.limit} onPage={page => setParams('/notifications', params, { page })} />
          </>
        )}
      </section>
    </>
  )
}
