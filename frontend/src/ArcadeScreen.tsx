import { ARCADE_RTP } from '@roulette/engine'
import type { LocalWalletAdapter } from '@roulette/game-client'
import { useI18n, type MessageKey } from './i18n'
import { ARCADE_SCREENS, routeForScreen, type ArcadeScreen as ArcadeGameScreen, type Screen } from './routes'
import { AviatorGame } from './arcade/AviatorGame'
import { GameIcon } from './arcade/GameIcon'
import { HorsesGame } from './arcade/HorsesGame'
import { PlinkoGame } from './arcade/PlinkoGame'
import { WheelGame } from './arcade/WheelGame'
import { posterOf } from './arcade/posters'
import { Coin } from './arcade/ui'
import { useArcade } from './arcade/useArcade'
import './arcade/arcade.css'

interface Props {
  /** `games` for the lobby, or one of the games. */
  screen: 'games' | ArcadeGameScreen
  practice: LocalWalletAdapter
  onNavigate: (screen: Screen) => void
  onSignIn: () => void
}

/** A real link: it can be crawled and opened in a new tab, while a plain click stays in the page. */
const linkTo = (screen: Screen, go: (screen: Screen) => void) => (event: React.MouseEvent) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  go(screen)
}

export function ArcadeScreen ({ screen, practice, onNavigate, onSignIn }: Props) {
  const { t, number } = useI18n()
  const arcade = useArcade(practice)
  const percent = (ARCADE_RTP * 100).toFixed(1).replace(/\.0$/, '')

  const balance = (
    <div className="arcade-balance" aria-live="polite">
      <Coin size={26} />
      <div>
        <span>{arcade.online ? t('nav.chips') : t('nav.practiceChips')}</span>
        <strong>{number(arcade.balance)}</strong>
        {!arcade.online && <button type="button" className="balance-link" onClick={onSignIn}>{t('games.signIn')} →</button>}
      </div>
    </div>
  )

  if (screen === 'games') {
    return (
      <main className="page arcade">
        <section className="lobby-hero">
          <div>
            <p className="eyebrow">{t('games.eyebrow')}</p>
            <h1 className="page-title">{t('games.titleA')} <em>{t('games.titleB')}</em></h1>
            <p className="lede">{t('games.lede')}</p>
          </div>
          {balance}
        </section>
        <ul className="poster-grid">
          {ARCADE_SCREENS.map(game => (
            <li key={game}>
              <a className={`poster poster-${game}`} href={routeForScreen(game).path} onClick={linkTo(game, onNavigate)} style={{ ['--art' as string]: `url(${posterOf(game)})` }}>
                <span className="poster-art" aria-hidden="true" />
                <span className="poster-badge">{t(`game.${game}.kicker` as MessageKey)}</span>
                <span className="poster-body">
                  <GameIcon game={game} />
                  <span className="poster-title">{t(`game.${game}.title` as MessageKey)}</span>
                  <span className="poster-blurb">{t(`game.${game}.blurb` as MessageKey)}</span>
                  <span className="poster-foot">
                    <span className="poster-rtp">{t('games.rtp', { percent })}</span>
                    <span className="poster-play">{t('games.play')} <b aria-hidden="true">→</b></span>
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </main>
    )
  }

  return (
    <main className="page arcade">
      <header className="arcade-header">
        <div className="arcade-header-main">
          <a className="arcade-back" href={routeForScreen('games').path} onClick={linkTo('games', onNavigate)}>{t('games.back')}</a>
          <div className="arcade-title">
            <GameIcon game={screen} />
            <div>
              <h1 className="page-title">{t(`game.${screen}.title` as MessageKey)}</h1>
              <p className="lede">{t(`game.${screen}.blurb` as MessageKey)}</p>
            </div>
          </div>
        </div>
        {balance}
      </header>
      <nav className="game-tabs" aria-label={t('games.eyebrow')}>
        {ARCADE_SCREENS.map(game => (
          <a key={game} href={routeForScreen(game).path} className={game === screen ? 'is-active' : ''} aria-current={game === screen ? 'page' : undefined} onClick={linkTo(game, onNavigate)}>
            <GameIcon game={game} />{t(`game.${game}.title` as MessageKey)}
          </a>
        ))}
      </nav>
      {screen === 'aviator' && <AviatorGame arcade={arcade} />}
      {screen === 'plinko' && <PlinkoGame arcade={arcade} />}
      {screen === 'wheel' && <WheelGame arcade={arcade} />}
      {screen === 'horses' && <HorsesGame arcade={arcade} />}
    </main>
  )
}
