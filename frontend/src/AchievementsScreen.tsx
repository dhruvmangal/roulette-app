import { useEffect, useState } from 'react'
import type { Achievement, AchievementsPage } from '@roulette/contracts'
import { useI18n, type MessageKey } from './i18n'
import { errorMessage, useSession } from './session'

// How the achievements are grouped on screen. Any code the server adds that isn't listed lands under "More".
const GROUPS: Array<{ id: 'play' | 'win' | 'social' | 'daily', codes: string[] }> = [
  { id: 'play', codes: ['FIRST_SPIN', 'REGULAR', 'DEDICATED', 'VETERAN', 'BOTH_WHEELS', 'EXPLORER', 'STRATEGIST'] },
  { id: 'win', codes: ['FIRST_WIN', 'HOT_STREAK', 'ON_FIRE', 'BIG_WIN', 'HIGH_ROLLER', 'STRAIGHT_UP', 'ZERO_HERO'] },
  { id: 'social', codes: ['FIRST_FRIEND', 'SOCIALITE', 'HOST', 'RECRUITER'] },
  { id: 'daily', codes: ['DAILY_WEEK'] }
]

function Card ({ achievement }: { achievement: Achievement }) {
  const { t, number, date } = useI18n()
  const earned = achievement.unlockedAt !== null
  const title = t(`ach.${achievement.code}.title` as MessageKey)
  return (
    <li className={`ach-card${earned ? ' is-earned' : ''}`}>
      <span className="ach-badge" aria-hidden="true">{earned ? '★' : '○'}</span>
      <div className="ach-text">
        <strong>{title}</strong>
        <small>{t(`ach.${achievement.code}.desc` as MessageKey, { target: number(achievement.target) })}</small>
        {earned
          ? <span className="ach-earned">{t('achievements.earned', { when: date(achievement.unlockedAt!) })}</span>
          : (
            <span className="ach-progress">
              <span className="ach-meter" role="meter" aria-label={title} aria-valuemin={0} aria-valuemax={achievement.target} aria-valuenow={achievement.progress}>
                <span style={{ width: `${achievement.progress / achievement.target * 100}%` }} />
              </span>
              <small>{number(achievement.progress)}/{number(achievement.target)}</small>
            </span>
            )}
      </div>
      <span className="ach-reward">{t('achievements.reward', { reward: number(achievement.reward) })}</span>
    </li>
  )
}

/** Every achievement with how far along the player is, and what each pays. */
export function AchievementsScreen () {
  const { api } = useSession()
  const { t, number } = useI18n()
  const [page, setPage] = useState<AchievementsPage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.achievements().then(next => { if (!cancelled) setPage(next) }).catch(failure => { if (!cancelled) setError(errorMessage(failure)) })
    return () => { cancelled = true }
  }, [api])

  const known = new Set(GROUPS.flatMap(group => group.codes))
  const sections = page
    ? [
        ...GROUPS.map(group => ({ id: group.id as string, items: group.codes.map(code => page.achievements.find(entry => entry.code === code)).filter((entry): entry is Achievement => Boolean(entry)) })),
        { id: 'other', items: page.achievements.filter(entry => !known.has(entry.code)) }
      ].filter(section => section.items.length)
    : []

  return (
    <main className="page achievements">
      <section className="page-head">
        <p className="eyebrow">{t('achievements.eyebrow')}</p>
        <h1 className="page-title">{t('achievements.titleA')} <em>{t('achievements.titleB')}</em></h1>
        <p className="lede">{t('achievements.lede')}</p>
        {page && (
          <>
            <p className="ach-summary">{t('achievements.summary', { unlocked: page.totals.unlocked, total: page.totals.total, chips: number(page.totals.chipsEarned) })}</p>
            <span className="ach-total" role="meter" aria-label={t('achievements.eyebrow')} aria-valuemin={0} aria-valuemax={page.totals.total} aria-valuenow={page.totals.unlocked}>
              <span style={{ width: `${page.totals.unlocked / page.totals.total * 100}%` }} />
            </span>
          </>
        )}
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!page && !error && <p className="dialog-copy">{t('achievements.loading')}</p>}
      {sections.map(section => (
        <section key={section.id} className="analytics-card" aria-labelledby={`ach-${section.id}`}>
          <h2 id={`ach-${section.id}`}>{t(`achievements.group.${section.id}` as MessageKey)}</h2>
          <ul className="ach-grid">
            {section.items.map(achievement => <Card key={achievement.code} achievement={achievement} />)}
          </ul>
        </section>
      ))}
    </main>
  )
}
