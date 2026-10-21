import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '@roulette/api-client'
import { ERROR_CODES, type Friend, type FriendsList } from '@roulette/contracts'
import { useI18n, type MessageKey } from './i18n'
import { errorMessage, useSession } from './session'
import { useSocial } from './social'

const REFRESH_MS = 30000

/** Why a request was turned down, in the player's words. */
function requestError (failure: unknown, t: (key: MessageKey) => string): string {
  if (!(failure instanceof ApiError)) return errorMessage(failure)
  if (failure.errorCode === ERROR_CODES.PlayerNameNotFound) return t('friends.error.notFound')
  if (failure.errorCode === ERROR_CODES.FriendRequestNotAllowed) {
    const why = String(failure.errors[0]?.details ?? '')
    if (why.includes('Self')) return t('friends.error.self')
    if (why.includes('AlreadyFriends')) return t('friends.error.already')
    if (why.includes('YouHaveTooMany')) return t('friends.error.youFull')
    if (why.includes('TheyHaveTooMany')) return t('friends.error.theyFull')
    if (why.includes('TooManyPending')) return t('friends.error.pending')
  }
  return errorMessage(failure)
}

function FriendRow ({ friend, onJoin, onRemove }: { friend: Friend, onJoin: (code: string) => void, onRemove: (friend: Friend) => Promise<void> }) {
  const { t, date } = useI18n()
  const [confirming, setConfirming] = useState(false)
  const table = friend.table
  return (
    <li className="friend-row">
      <span className={`friend-avatar${friend.online ? ' is-online' : ''}`} aria-hidden="true">{friend.username.charAt(0).toUpperCase()}</span>
      <span className="friend-who">
        <strong>{friend.username}</strong>
        <small>
          {table
            ? t(table.hasRoom ? 'friends.status.playing' : 'friends.status.playingFull', { code: table.code, seated: table.seated, max: table.maxSeats })
            : friend.online
              ? t('friends.status.online')
              : friend.lastSeenAt ? t('friends.status.lastSeen', { when: date(friend.lastSeenAt) }) : t('friends.status.offline')}
        </small>
      </span>
      <span className="friend-actions">
        {table?.hasRoom && <button type="button" className="btn-gold small" onClick={() => onJoin(table.code)}>{t('friends.join')}</button>}
        {confirming
          ? (
            <>
              <button type="button" className="btn-ghost small" onClick={() => { void onRemove(friend) }}>{t('friends.removeYes')}</button>
              <button type="button" className="link-button" onClick={() => setConfirming(false)}>{t('friends.removeNo')}</button>
            </>
            )
          : <button type="button" className="link-button friend-remove" onClick={() => setConfirming(true)} aria-label={t('friends.removeConfirm', { name: friend.username })}>{t('friends.remove')}</button>}
      </span>
    </li>
  )
}

/** Friends: add by username, answer requests, see who's online and where, and join them. */
export function FriendsScreen ({ onJoin }: { onJoin: (code: string) => void }) {
  const { api } = useSession()
  const { t } = useI18n()
  const { version, refresh } = useSocial()
  const [list, setList] = useState<FriendsList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean, text: string } | null>(null)

  const load = useCallback(() => {
    api.friends().then(setList).catch(failure => setError(errorMessage(failure)))
  }, [api])

  // Load now, when something changes, and every half minute so who's online stays fresh.
  useEffect(load, [load, version])
  useEffect(() => {
    const timer = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  /** Runs a change, then reloads; a failure is shown, not thrown. */
  const act = async (work: () => Promise<unknown>) => {
    try { await work(); setError(null) } catch (failure) { setError(requestError(failure, t)) }
    load()
    refresh()
  }

  async function add (event: FormEvent) {
    event.preventDefault()
    const name = username.trim()
    if (!name) return
    setSending(true)
    setResult(null)
    try {
      const sent = await api.requestFriend(name)
      setUsername('')
      setResult({ ok: true, text: t(sent.status === 'ACCEPTED' ? 'friends.add.nowFriends' : 'friends.add.sent', { name: sent.friend.username }) })
      load()
      refresh()
    } catch (failure) {
      setResult({ ok: false, text: requestError(failure, t) })
    } finally {
      setSending(false)
    }
  }

  const online = list?.friends.filter(friend => friend.online).length ?? 0

  return (
    <main className="page friends">
      <section className="page-head">
        <p className="eyebrow">{t('friends.eyebrow')}</p>
        <h1 className="page-title">{t('friends.titleA')} <em>{t('friends.titleB')}</em></h1>
        <p className="lede">{t('friends.lede')}</p>
      </section>

      <section className="analytics-card" aria-labelledby="add-friend-heading">
        <h2 id="add-friend-heading">{t('friends.add.title')}</h2>
        <form className="refer-enter friend-add" onSubmit={event => { void add(event) }}>
          <input value={username} onChange={event => setUsername(event.target.value)} placeholder={t('friends.add.placeholder')} aria-label={t('friends.add.placeholder')} maxLength={32} autoCapitalize="none" autoComplete="off" spellCheck={false} />
          <button type="submit" className="btn-gold small" disabled={sending || !username.trim()}>{sending ? t('friends.add.sending') : t('friends.add.button')}</button>
        </form>
        {result && <p className={result.ok ? 'friend-note' : 'form-error'} role={result.ok ? 'status' : 'alert'}>{result.text}</p>}
        <p className="analytics-note">{t('friends.add.hint')}</p>
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}

      {list && list.incoming.length > 0 && (
        <section className="analytics-card" aria-labelledby="requests-heading">
          <h2 id="requests-heading">{t('friends.requests.title')}</h2>
          <ul className="friend-list">
            {list.incoming.map(request => (
              <li key={request.friendshipId} className="friend-row">
                <span className="friend-avatar" aria-hidden="true">{request.username.charAt(0).toUpperCase()}</span>
                <span className="friend-who"><strong>{request.username}</strong></span>
                <span className="friend-actions">
                  <button type="button" className="btn-gold small" onClick={() => { void act(() => api.acceptFriend(request.friendshipId)) }}>{t('friends.requests.accept')}</button>
                  <button type="button" className="btn-ghost small" onClick={() => { void act(() => api.declineFriend(request.friendshipId)) }}>{t('friends.requests.decline')}</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="analytics-card" aria-labelledby="friends-heading">
        <h2 id="friends-heading">{t('friends.list.title')}{list && list.friends.length > 0 && <small className="friend-count"> {t('friends.list.online', { count: online })}</small>}</h2>
        {list && (list.friends.length
          ? (
            <ul className="friend-list">
              {list.friends.map(friend => <FriendRow key={friend.playerId} friend={friend} onJoin={onJoin} onRemove={f => act(() => api.removeFriend(f.playerId))} />)}
            </ul>
            )
          : <p className="dialog-copy">{t('friends.list.empty')}</p>)}
      </section>

      {list && list.outgoing.length > 0 && (
        <section className="analytics-card" aria-labelledby="outgoing-heading">
          <h2 id="outgoing-heading">{t('friends.outgoing.title')}</h2>
          <ul className="friend-list">
            {list.outgoing.map(request => (
              <li key={request.friendshipId} className="friend-row">
                <span className="friend-avatar" aria-hidden="true">{request.username.charAt(0).toUpperCase()}</span>
                <span className="friend-who"><strong>{request.username}</strong></span>
                <span className="friend-actions"><button type="button" className="link-button" onClick={() => { void act(() => api.removeFriend(request.playerId)) }}>{t('friends.outgoing.cancel')}</button></span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
