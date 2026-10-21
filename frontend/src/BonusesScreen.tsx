import { useCallback, useEffect, useState } from 'react'
import type { BonusOffer } from '@roulette/contracts'
import { useI18n, type MessageKey, type Translate } from './i18n'
import { errorMessage, useSession } from './session'

const DAILY_MAX = 7
const REASONS = ['CoolingDown', 'BalanceTooHigh', 'MaxClaimsReached']

function until (iso: string | null, now: number, t: Translate) {
  if (!iso) return ''
  const minutes = Math.max(1, Math.round((Date.parse(iso) - now) / 60000))
  return minutes >= 60 ? t('bonuses.inHours', { h: Math.floor(minutes / 60), m: minutes % 60 }) : t('bonuses.inMinutes', { m: minutes })
}

/** Free chips: the daily bonus (with its streak) and a refill for when chips run out. */
export function BonusesScreen ({ onClaimed }: { onClaimed: (amount: number) => void }) {
  const { api, refreshWallet } = useSession()
  const { t, number } = useI18n()
  const [offers, setOffers] = useState<BonusOffer[] | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(() => {
    api.bonuses().then(({ bonuses }) => setOffers(bonuses)).catch(failure => setError(errorMessage(failure)))
  }, [api])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  async function claim (code: string) {
    setClaiming(code)
    setError(null)
    try {
      const { bonus } = await api.claimBonus(code)
      await refreshWallet()
      onClaimed(bonus.amount)
      load()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setClaiming(null)
    }
  }

  return (
    <main className="page">
      <section className="page-head">
        <p className="eyebrow">{t('bonuses.eyebrow')}</p>
        <h1 className="page-title">{t('bonuses.titleA')} <em>{t('bonuses.titleB')}</em></h1>
        <p className="lede">{t('bonuses.lede', { days: DAILY_MAX })}</p>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="bonus-grid">
        {offers === null && !error && <p className="dialog-copy">{t('common.loading')}</p>}
        {offers?.map(offer => {
          // While cooling down, the offer describes the *next* claim: tomorrow's day and amount.
          const waiting = !offer.claimable && offer.reason === 'CoolingDown'
          const daysEarned = offer.streakDay ? offer.streakDay - (offer.claimable || waiting ? 1 : 0) : 0
          return (
          <article key={offer.code} className={`bonus-card${offer.claimable ? ' is-ready' : ''}`}>
            <p className="card-kicker">{t(offer.type === 'DAILY' ? 'ledger.DAILY_BONUS' : offer.type === 'REFILL' ? 'ledger.REFILL_BONUS' : 'ledger.PROMO_BONUS')}</p>
            <p className="bonus-amount">+{number(offer.amount)}{waiting && offer.type === 'DAILY' && <small> {t('bonuses.next')}</small>}</p>
            {offer.type === 'DAILY' && offer.streakDay && (
              <ol className="streak" aria-label={t('bonuses.streakAria', { earned: daysEarned, max: DAILY_MAX })}>
                {Array.from({ length: DAILY_MAX }, (_, i) => (
                  <li key={i} className={i < daysEarned ? 'is-lit' : i === offer.streakDay! - 1 ? 'is-next' : ''} aria-hidden="true">{i + 1}</li>
                ))}
              </ol>
            )}
            <p className="card-blurb">
              {offer.claimable
                ? offer.type === 'DAILY' ? t('bonuses.day', { day: offer.streakDay ?? 1 }) : t('bonuses.ready')
                : waiting && offer.type === 'DAILY'
                  ? t('bonuses.claimedToday', { day: offer.streakDay ?? 1, when: until(offer.nextAvailableAt, now, t) })
                  : `${REASONS.includes(offer.reason ?? '') ? t(`bonuses.reason.${offer.reason}` as MessageKey) : t('bonuses.reason.other')}${offer.nextAvailableAt ? ` · ${t('bonuses.back', { when: until(offer.nextAvailableAt, now, t) })}` : ''}`}
            </p>
            <button type="button" className="btn-gold" disabled={!offer.claimable || claiming !== null} onClick={() => claim(offer.code)}>
              {claiming === offer.code ? t('bonuses.claiming') : t('bonuses.claim')}
            </button>
          </article>
          )
        })}
      </div>
    </main>
  )
}
