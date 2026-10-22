import { useEffect, useRef, useState } from 'react'
import { useI18n } from './i18n'
import { useSession } from './session'
import { useSocial } from './social'
import { onCrazyGames } from './crazygames'

import { routeForScreen, type Screen } from './routes'

export type { Screen }

interface Props {
  onNavigate: (screen: Screen) => void
  onSignIn: () => void
  onSaveAccount: () => void
  /** What the balance shows; the online wallet when omitted. */
  balance?: { label: string, value: number }
  practiceBalance: number
}

export function TopBar ({ onNavigate, onSignIn, onSaveAccount, balance, practiceBalance }: Props) {
  const { status, player, balance: chips, logout } = useSession()
  const { t, number } = useI18n()
  const { incoming } = useSocial()
  const [menuOpen, setMenuOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menu.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [menuOpen])

  const shown = balance ?? (status === 'signedIn' && chips !== null ? { label: t('nav.chips'), value: chips } : { label: t('nav.practiceChips'), value: practiceBalance })
  const go = (screen: Screen) => { setMenuOpen(false); onNavigate(screen) }

  /** A real link, so it can be crawled and opened in a new tab; a plain click stays in the page. */
  const link = (screen: Screen) => (event: React.MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onNavigate(screen)
  }

  return (
    <header className="topbar">
      <a className="wordmark" href={routeForScreen('home').path} onClick={link('home')} aria-label={t('nav.home')}>
        <img className="mark" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="36" height="36" /><span>Roulette</span>
      </a>
      <span className="badge"><i /> {t('nav.badge')}</span>
      <a className="topbar-link" href={routeForScreen('games').path} onClick={link('games')}>{t('nav.games')}</a>
      <a className="topbar-link topbar-link-next" href={routeForScreen('learn').path} onClick={link('learn')}>{t('nav.learn')}</a>
      <button type="button" className="topbar-icon" onClick={() => onNavigate('settings')} aria-label={t('menu.settings')} title={t('menu.settings')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.5-2.3.9a7.5 7.5 0 0 0-1.7-1L15 3.5h-4l-.4 2.4a7.5 7.5 0 0 0-1.7 1l-2.3-.9-2 3.5 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.3-.9a7.5 7.5 0 0 0 1.7 1l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 1.7-1l2.3.9 2-3.5-2-1.5ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" transform="translate(-1 0)" /></svg>
      </button>
      <div className="topbar-end">
        <div className="balance" aria-live="polite">
          <span>{shown.label}</span>
          <strong>{number(shown.value)}</strong>
        </div>
        {status === 'signedIn' && player
          ? (
            <div className="account" ref={menu}>
              <button type="button" className="account-button" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>
                <span className="avatar" aria-hidden="true">{player.username.charAt(0).toUpperCase()}</span>
                {incoming > 0 && <span className="avatar-dot" aria-hidden="true" />}
                <span className="account-name">{player.username}</span>
              </button>
              {menuOpen && (
                <div className="account-menu" role="menu">
                  <p className="account-meta">{player.isGuest ? t('account.guest') : player.email ?? t('account.signedInWith', { providers: player.providers.join(' & ') })}</p>
                  {player.isGuest && <button type="button" role="menuitem" className="is-highlight" onClick={() => { setMenuOpen(false); onSaveAccount() }}>{t('menu.saveAccount')}</button>}
                  <button type="button" role="menuitem" onClick={() => go('wallet')}>{t('menu.wallet')}</button>
                  <button type="button" role="menuitem" onClick={() => go('bonuses')}>{t('menu.bonuses')}</button>
                  <button type="button" role="menuitem" onClick={() => go('friends')}>{t('menu.friends')}{incoming > 0 && <span className="nav-dot" aria-label={String(incoming)}>{incoming}</span>}</button>
                  <button type="button" role="menuitem" onClick={() => go('achievements')}>{t('menu.achievements')}</button>
                  <button type="button" role="menuitem" onClick={() => go('refer')}>{t('menu.refer')}</button>
                  <button type="button" role="menuitem" onClick={() => go('history')}>{t('menu.history')}</button>
                  <button type="button" role="menuitem" onClick={() => go('analytics')}>{t('menu.analytics')}</button>
                  <button type="button" role="menuitem" onClick={() => go('games')}>{t('menu.games')}</button>
                  <button type="button" role="menuitem" onClick={() => go('learn')}>{t('menu.learn')}</button>
                  <button type="button" role="menuitem" onClick={() => go('leaderboard')}>{t('menu.leaderboard')}</button>
                  <button type="button" role="menuitem" onClick={() => go('settings')}>{t('menu.settings')}</button>
                  <hr />
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void logout() }}>{t('menu.signOut')}</button>
                  {!player.isGuest && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void logout(true) }}>{t('menu.signOutAll')}</button>}
                </div>
              )}
            </div>
            )
          : status === 'signedOut' && !onCrazyGames && <button type="button" className="btn-ghost small" onClick={onSignIn}>{t('nav.signIn')}</button>}
      </div>
    </header>
  )
}
