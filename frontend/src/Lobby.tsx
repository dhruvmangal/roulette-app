import { useState } from 'react'
import type { TableState } from '@roulette/game-client'
import { useI18n } from './i18n'
import { variantTitle } from './invite'

interface Props {
  table: TableState
  maxSeats?: number
  onInvite: () => void
  /** Present for the host only. */
  onStart?: () => Promise<boolean>
}

/**
 * A private table before the game: who has sat down so far, how to invite
 * more, and (for the host) the button that deals the first round.
 */
export function Lobby ({ table, maxSeats = 8, onInvite, onStart }: Props) {
  const { t } = useI18n()
  const [starting, setStarting] = useState(false)
  const [failed, setFailed] = useState(false)
  const lobby = table.lobby!
  const humans = table.seats.filter(seat => !seat.botStyle).length

  const start = async () => {
    if (!onStart) return
    setStarting(true)
    setFailed(false)
    if (!await onStart()) {
      setFailed(true)
      setStarting(false)
    }
  }

  return (
    <section className="waiting-room" aria-labelledby="lobby-title">
      <div className="lobby-card">
        <p className="eyebrow">{t('lobby.eyebrow')}</p>
        <h2 id="lobby-title">{humans > 1 ? t('lobby.here') : t('lobby.invite')}</h2>
        <p className="lobby-copy">
          {lobby.isHost ? t('lobby.copyHost', { variant: variantTitle(table.variant) }) : t('lobby.copyGuest', { variant: variantTitle(table.variant), host: lobby.hostName ?? t('lobby.theHost') })}
        </p>

        <div className="lobby-code">
          <span>{t('lobby.code')}</span>
          <strong>{table.roomCode}</strong>
          <button type="button" className="btn-ghost small" onClick={onInvite}>{t('table.inviteFriends')}</button>
        </div>

        <p className="setup-label">{t('lobby.seated', { count: table.seats.length, max: maxSeats })}</p>
        <ul className="lobby-seats">
          {table.seats.map(seat => (
            <li key={seat.playerId} className={seat.playerId === table.me ? 'is-me' : ''}>
              <span className="lobby-avatar" aria-hidden="true">{seat.name.slice(0, 1).toUpperCase()}</span>
              <span className="lobby-name">{seat.name}</span>
              {seat.name === lobby.hostName && !seat.botStyle && <span className="lobby-tag">{t('lobby.host')}</span>}
              {seat.botStyle && <span className="lobby-tag muted">{t('lobby.computer')}</span>}
              {seat.playerId === table.me && <span className="lobby-tag muted">{t('lobby.you')}</span>}
            </li>
          ))}
          {Array.from({ length: Math.max(0, Math.min(3, maxSeats - table.seats.length)) }, (_, i) => (
            <li key={`empty-${i}`} className="is-empty"><span className="lobby-avatar" aria-hidden="true">+</span><span className="lobby-name">{t('lobby.free')}</span></li>
          ))}
        </ul>

        {onStart
          ? (
            <>
              <button type="button" className="btn-gold" disabled={starting} onClick={() => { void start() }}>
                {starting ? t('lobby.starting') : humans > 1 ? t('lobby.start') : t('lobby.startAlone')}
              </button>
              {failed && <p className="form-error" role="alert">{t('lobby.failed')}</p>}
            </>
            )
          : (
            <p className="lobby-waiting" role="status"><span className="spinner" aria-hidden="true" /> {t('lobby.waiting', { host: lobby.hostName ?? t('lobby.theHost') })}</p>
            )}
      </div>
    </section>
  )
}
