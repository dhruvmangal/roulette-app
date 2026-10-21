import { useEffect, useState, type ReactNode } from 'react'
import type { VariantName } from '@roulette/engine'
import { ApiError } from '@roulette/api-client'
import { ERROR_CODES, type Friend } from '@roulette/contracts'
import { siInstagram, siTelegram, siWhatsapp } from 'simple-icons'
import { useI18n } from './i18n'
import { errorMessage, useSession } from './session'
import { copyText, inviteText, inviteUrl } from './invite'
import { renderInviteCard } from './inviteCard'
import { canShare, shareSheet } from './native'
import { isNativeApp } from './platform'

interface Props {
  code: string
  variant: VariantName
  /** Who is inviting (this player's name), for the message and picture. */
  from: string | null
  onClose: () => void
}

const BrandIcon = ({ path }: { path: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>
)

const MessageIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /></svg>
)

const MailIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1.4 2L12 12.2 19.6 7H4.4ZM20 8.6l-8 5.5-8-5.5V17h16V8.6Z" /></svg>
)

interface App { name: string, className: string, icon: ReactNode, href?: string, onClick?: () => void }

interface ShareAppsProps {
  url: string
  /** The whole message, link included. */
  message: string
  /** The share sheet title and email subject. */
  subject: string
  image?: { blob: Blob, name: string }
  /** Tells the player about anything they need to finish by hand. */
  onNote: (note: string) => void
}

/** Chat apps, SMS and email with the message filled in, plus the system share sheet where there is one. */
export function ShareApps ({ url, message, subject, image, onNote }: ShareAppsProps) {
  const { t } = useI18n()
  const encoded = encodeURIComponent(message)
  const share = () => shareSheet({ title: subject, text: message, image })

  // Instagram has no web link for sending a message: use the share sheet where
  // there is one, otherwise copy the message and open Instagram's inbox.
  const instagram = async () => {
    if (canShare && await share()) return
    await copyText(message)
    onNote(t('invite.instagram'))
    window.open('https://www.instagram.com/direct/inbox/', '_blank', 'noopener')
  }

  const apps: App[] = [
    { name: 'WhatsApp', className: 'app-whatsapp', icon: <BrandIcon path={siWhatsapp.path} />, href: `https://wa.me/?text=${encoded}` },
    { name: 'Telegram', className: 'app-telegram', icon: <BrandIcon path={siTelegram.path} />, href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message.replace(url, '').replace(/\n{3,}/g, '\n\n'))}` },
    { name: 'Instagram', className: 'app-instagram', icon: <BrandIcon path={siInstagram.path} />, onClick: () => { void instagram() } },
    { name: 'Messages', className: 'app-messages', icon: <MessageIcon />, href: `sms:?&body=${encoded}` },
    { name: 'Email', className: 'app-email', icon: <MailIcon />, href: `mailto:?subject=${encodeURIComponent(subject)}&body=${encoded}` }
  ]

  return (
    <>
      <ul className="invite-apps">
        {apps.map(app => (
          <li key={app.name}>
            {app.href
              ? <a className={`invite-app ${app.className}`} href={app.href} target="_blank" rel="noreferrer"><span className="invite-app-icon">{app.icon}</span>{app.name}</a>
              : <button type="button" className={`invite-app ${app.className}`} onClick={app.onClick}><span className="invite-app-icon">{app.icon}</span>{app.name}</button>}
          </li>
        ))}
      </ul>
      {canShare && (
        <button type="button" className="btn-gold" onClick={() => { void share() }}>{t('invite.more')}</button>
      )}
    </>
  )
}

/** Friends who are online and not at a table yet, each with an Invite button: they get it on screen at once. */
function FriendInvites ({ code }: { code: string }) {
  const { api, status } = useSession()
  const { t } = useI18n()
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [invited, setInvited] = useState<Set<number>>(new Set())
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'signedIn') return
    let cancelled = false
    api.friends().then(list => { if (!cancelled) setFriends(list.friends.filter(friend => friend.online && !friend.table)) }).catch(() => {})
    return () => { cancelled = true }
  }, [api, status])

  if (status !== 'signedIn' || friends === null) return null

  async function invite (friend: Friend) {
    setProblem(null)
    try {
      await api.inviteFriend(friend.playerId, code)
      setInvited(current => new Set(current).add(friend.playerId))
    } catch (failure) {
      setProblem(failure instanceof ApiError && failure.errorCode === ERROR_CODES.FriendInviteNotAllowed ? t('friends.invite.tooSoon') : errorMessage(failure))
    }
  }

  return (
    <div className="friend-invites">
      <p className="stat-label">{t('friends.invite.title')}</p>
      {friends.length === 0
        ? <p className="analytics-note">{t('friends.invite.none')}</p>
        : (
          <ul className="friend-list">
            {friends.map(friend => (
              <li key={friend.playerId} className="friend-row">
                <span className="friend-avatar is-online" aria-hidden="true">{friend.username.charAt(0).toUpperCase()}</span>
                <span className="friend-who"><strong>{friend.username}</strong></span>
                <span className="friend-actions">
                  <button type="button" className="btn-ghost small" disabled={invited.has(friend.playerId)} onClick={() => { void invite(friend) }}>
                    {invited.has(friend.playerId) ? t('friends.invite.sent') : t('friends.invite.button')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          )}
      {problem && <p className="form-error" role="alert">{problem}</p>}
    </div>
  )
}

/**
 * Inviting friends to a private table: a message with the link and code, and
 * a picture of the invite, sent through the share sheet or a chat app, or
 * copied by hand.
 */
export function ShareInvite ({ code, variant, from, onClose }: Props) {
  const { t } = useI18n()
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [card, setCard] = useState<{ blob: Blob, url: string } | null>(null)
  const details = { code, variant, from }
  const url = inviteUrl(code)
  const message = inviteText(details)
  const imageName = `roulette-invite-${code}.png`

  useEffect(() => {
    let objectUrl: string | null = null
    renderInviteCard(details)
      .then(blob => { objectUrl = URL.createObjectURL(blob); setCard({ blob, url: objectUrl }) })
      .catch(() => {})
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
    // The picture only depends on the table and who is inviting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, variant, from])

  useEffect(() => {
    if (!copied && !note) return
    const timer = window.setTimeout(() => { setCopied(null); setNote(null) }, 3500)
    return () => window.clearTimeout(timer)
  }, [copied, note])

  const copy = async (what: 'code' | 'link') => {
    if (await copyText(what === 'code' ? code : url)) setCopied(what)
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="dialog invite" role="dialog" aria-modal="true" aria-labelledby="invite-title" onClick={event => event.stopPropagation()}>
        <button type="button" className="dialog-close" aria-label={t('common.close')} onClick={onClose}>×</button>
        <p className="eyebrow">{t('home.card.private.title')}</p>
        <h2 id="invite-title">{t('lobby.invite')}</h2>

        <div className="invite-preview">
          {card ? <img src={card.url} alt={t('invite.cardAlt', { code })} /> : <div className="invite-preview-placeholder" aria-hidden="true" />}
          <div className="invite-code">
            <span className="invite-code-label">{t('lobby.code')}</span>
            <span className="invite-code-value" aria-label={t('invite.codeAria', { code: code.split('').join(' ') })}>{code}</span>
            <button type="button" className="btn-ghost small" onClick={() => { void copy('code') }}>{copied === 'code' ? t('invite.copied') : t('refer.copyCode')}</button>
          </div>
        </div>

        <div className="invite-link">
          <input readOnly value={url} aria-label={t('invite.linkAria')} onFocus={event => event.target.select()} />
          <button type="button" className="btn-ghost small" onClick={() => { void copy('link') }}>{copied === 'link' ? t('invite.copied') : t('refer.copyLink')}</button>
        </div>

        <FriendInvites code={code} />

        <ShareApps
          url={url}
          message={message}
          subject="Join my roulette table"
          image={card ? { blob: card.blob, name: imageName } : undefined}
          onNote={setNote}
        />

        <p className="invite-hint" role="status">
          {note ?? (copied ? t(copied === 'code' ? 'refer.codeCopied' : 'refer.linkCopied') : t('invite.hint'))}
          {!isNativeApp && card && !note && !copied && <> <a href={card.url} download={imageName}>{t('invite.savePicture')}</a></>}
        </p>
      </section>
    </div>
  )
}
