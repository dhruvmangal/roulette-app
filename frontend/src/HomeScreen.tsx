import type { VariantName } from '@roulette/engine'
import type { MyTable } from '@roulette/contracts'
import { useI18n, type MessageKey } from './i18n'
import { Wheel3D } from './Wheel3D'
import { VARIANT_INFO } from './TableScreen'
import type { OnlineMode } from './OnlineDialog'

/** Each card's picture (public/cards/*.jpg): views of the same wheel, so the cards match. */
const CARD_IMAGES: Record<OnlineMode | VariantName, string> = {
  computer: 'computer',
  quick: 'quick',
  private: 'private',
  AMERICAN: 'american',
  ENGLISH: 'english'
}

const CardImage = ({ kind }: { kind: OnlineMode | VariantName }) => (
  <img className="card-image" src={`${import.meta.env.BASE_URL}cards/${CARD_IMAGES[kind]}.jpg`} alt="" aria-hidden="true" loading="lazy" decoding="async" />
)

interface Props {
  practiceBalance: number
  /** Online tables the player still has a seat at. */
  seatedAt: MyTable[]
  onRejoin: (table: MyTable) => void
  onGiveUpSeat: (table: MyTable) => void
  onLeaderboard: () => void
  onLearn: () => void
  onRefer: () => void
  onFriends: () => void
  onOffline: (variant: VariantName) => void
  onOnline: (mode: OnlineMode) => void
}

const ONLINE: OnlineMode[] = ['computer', 'quick', 'private']

export function HomeScreen ({ practiceBalance, seatedAt, onRejoin, onGiveUpSeat, onLeaderboard, onLearn, onRefer, onFriends, onOffline, onOnline }: Props) {
  const { t, number } = useI18n()
  return (
    <main className="lobby">
      {seatedAt.length > 0 && (
        <section className="rejoin" aria-label={t('home.rejoin.aria')}>
          {seatedAt.map(table => (
            <div key={table.roomId} className="rejoin-row">
              <p>
                <strong>{t('home.rejoin.title')}</strong>{' '}
                {table.mode === 'VS_COMPUTER' ? t('home.rejoin.computer') : t(table.mode === 'PRIVATE' ? 'home.rejoin.private' : 'home.rejoin.public', { code: table.code })}
                {' '}· {t(`variant.${table.variant}` as MessageKey)} · {t('home.rejoin.seated', { count: table.players + table.bots })}
              </p>
              <div className="rejoin-actions">
                <button type="button" className="btn-gold small" onClick={() => onRejoin(table)}>{t('home.rejoin.rejoin')}</button>
                <button type="button" className="btn-ghost small" onClick={() => onGiveUpSeat(table)}>{t('home.rejoin.leave')}</button>
              </div>
            </div>
          ))}
        </section>
      )}
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Les jeux sont faits</p>
          <h1>{t('home.titleA')}<br /><em>{t('home.titleB')}</em></h1>
          <p className="lede">{t('home.lede')}</p>
          <div className="hero-actions">
            <button type="button" className="btn-gold" onClick={() => onOnline('quick')}>{t('home.playOnline')}</button>
            <button type="button" className="btn-ghost" onClick={() => onOffline('AMERICAN')}>{t('home.practise')}</button>
          </div>
        </div>
        <div className="hero-wheel">
          <Wheel3D variant="ENGLISH" compact />
        </div>
      </section>

      <section className="tables" aria-labelledby="online-heading">
        <div className="section-head">
          <p className="eyebrow" id="online-heading">{t('home.playOnline')}</p>
          <span className="section-links">
            <button type="button" className="link-button" onClick={onFriends}>{t('home.link.friends')}</button>
            <button type="button" className="link-button" onClick={onRefer}>{t('home.link.refer')}</button>
            <button type="button" className="link-button" onClick={onLearn}>{t('home.link.learn')}</button>
            <button type="button" className="link-button" onClick={onLeaderboard}>{t('home.link.leaderboard')}</button>
          </span>
        </div>
        <div className="table-grid">
          {ONLINE.map(mode => (
            <button key={mode} type="button" className="table-card has-image" onClick={() => onOnline(mode)}>
              <CardImage kind={mode} />
              <span className="card-kicker">{t(`home.card.${mode}.kicker` as MessageKey)}</span>
              <span className="card-title">{t(`home.card.${mode}.title` as MessageKey)}</span>
              <span className="card-blurb">{t(`home.card.${mode}.blurb` as MessageKey)}</span>
              <span className="card-arrow" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </section>

      <section className="tables" aria-labelledby="offline-heading">
        <div className="section-head">
          <p className="eyebrow" id="offline-heading">{t('home.offline.eyebrow', { chips: number(practiceBalance) })}</p>
        </div>
        <div className="table-grid">
          {(['AMERICAN', 'ENGLISH'] as const).map(name => (
            <button key={name} type="button" className="table-card has-image" onClick={() => onOffline(name)}>
              <CardImage kind={name} />
              <span className="card-kicker">{t('home.variant.kicker', { pockets: VARIANT_INFO[name].pockets, edge: VARIANT_INFO[name].edge })}</span>
              <span className="card-title">{t(`variant.${name}` as MessageKey)}</span>
              <span className="card-blurb">{t('home.variant.blurb', { blurb: t(`variant.${name}.blurb` as MessageKey) })}</span>
              <span className="card-arrow" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}
