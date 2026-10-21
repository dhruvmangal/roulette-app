import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ApiError } from '@roulette/api-client'
import { ERROR_CODES, type ReferralPage, type ReferralProgress } from '@roulette/contracts'
import { copyText, referralText, referralUrl } from './invite'
import { useI18n, type Translate } from './i18n'
import { errorMessage, useSession } from './session'
import { ShareApps } from './ShareInvite'

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }

/** Why a friend's code was turned down, in the player's words. */
function claimError (failure: unknown, t: Translate): string {
  if (!(failure instanceof ApiError)) return errorMessage(failure)
  if (failure.errorCode === ERROR_CODES.ReferralCodeNotFound) return t('refer.error.notFound')
  if (failure.errorCode === ERROR_CODES.ReferralNotAllowed) {
    const why = failure.errors[0]?.details ?? ''
    if (why.includes('OwnCode')) return t('refer.error.own')
    if (why.includes('AlreadyReferred')) return t('refer.error.already')
    if (why.includes('TooLate')) return t('refer.error.late')
    if (why.includes('ReferredYou')) return t('refer.error.loop')
  }
  return errorMessage(failure)
}

/** Where a referral stands: the two things to do, and whether it has paid. */
function Progress ({ progress, roundsRequired, reward }: { progress: ReferralProgress, roundsRequired: number, reward: number }) {
  const { t, number } = useI18n()
  if (progress.status === 'REWARDED') return <span className="referral-status is-paid">{t('refer.paid', { amount: number(progress.reward) })}</span>
  if (progress.status === 'REJECTED') return <span className="referral-status is-rejected" title={t('refer.rejectedWhy')}>{t('refer.rejected')}</span>
  return (
    <span className="referral-progress">
      <span className={`referral-step${progress.savedAccount ? ' is-done' : ''}`}>{progress.savedAccount ? '✓' : '○'} {t('refer.accountSaved')}</span>
      <span className="referral-step">
        <span className="referral-meter" role="meter" aria-valuemin={0} aria-valuemax={roundsRequired} aria-valuenow={progress.roundsPlayed} aria-label={t('refer.roundsAria')}>
          <span style={{ width: `${progress.roundsPlayed / roundsRequired * 100}%` }} />
        </span>
        {t('refer.rounds', { played: progress.roundsPlayed, required: roundsRequired })}
      </span>
      <small>{t('refer.whenDone', { amount: number(reward) })}</small>
    </span>
  )
}

/** Refer & earn: the player's code and link, friends who joined with it, and a box for a friend's code. */
export function ReferScreen ({ onSaveAccount }: { onSaveAccount: () => void }) {
  const { api, player } = useSession()
  const { t, number, date } = useI18n()
  const [page, setPage] = useState<ReferralPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [friendCode, setFriendCode] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimFailure, setClaimFailure] = useState<string | null>(null)

  const load = useCallback(() => {
    api.referrals().then(setPage).catch(failure => setError(errorMessage(failure)))
  }, [api])
  useEffect(load, [load])

  useEffect(() => {
    if (!note) return
    const timer = window.setTimeout(() => setNote(null), 3500)
    return () => window.clearTimeout(timer)
  }, [note])

  async function claim (event: FormEvent) {
    event.preventDefault()
    setClaiming(true)
    setClaimFailure(null)
    try {
      await api.claimReferral(friendCode)
      setFriendCode('')
      load()
    } catch (failure) {
      setClaimFailure(claimError(failure, t))
    } finally {
      setClaiming(false)
    }
  }

  const rules = page?.rules
  const url = page ? referralUrl(page.code) : ''
  const copy = async (what: 'code' | 'link') => {
    if (page && await copyText(what === 'code' ? page.code : url)) setNote(t(what === 'code' ? 'refer.codeCopied' : 'refer.linkCopied'))
  }

  return (
    <main className="page refer">
      <section className="page-head">
        <p className="eyebrow">{t('menu.refer')}</p>
        <h1 className="page-title">{t('refer.give', { amount: rules ? number(rules.friendReward) : '…' })} <em>{t('refer.get', { amount: rules ? number(rules.referrerReward) : '…' })}</em></h1>
        <p className="lede">
          {t('refer.lede', { rounds: rules?.roundsRequired ?? 10, mine: rules ? number(rules.referrerReward) : '…', theirs: rules ? number(rules.friendReward) : '…' })}
        </p>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!page && !error && <p className="dialog-copy">{t('refer.loading')}</p>}

      {page && rules && (
        <>
          <div className="refer-layout">
            <section className="analytics-card refer-share" aria-labelledby="share-heading">
              <h2 id="share-heading">{t('refer.yourCode')}</h2>
              <div className="refer-code">
                <span className="invite-code-value" aria-label={t('refer.codeAria', { code: page.code.split('').join(' ') })}>{page.code}</span>
                <button type="button" className="btn-ghost small" onClick={() => { void copy('code') }}>{t('refer.copyCode')}</button>
              </div>
              <div className="invite-link">
                <input readOnly value={url} aria-label={t('refer.linkAria')} onFocus={event => event.target.select()} />
                <button type="button" className="btn-ghost small" onClick={() => { void copy('link') }}>{t('refer.copyLink')}</button>
              </div>
              <ShareApps url={url} message={referralText(page.code, player?.username ?? null, rules.friendReward)} subject={t('refer.subject')} onNote={setNote} />
              <p className="invite-hint" role="status">{note ?? t('refer.shareHint')}</p>
            </section>

            <section className="analytics-card" aria-labelledby="how-heading">
              <h2 id="how-heading">{t('refer.how')}</h2>
              <ol className="refer-steps">
                <li><strong>{t('refer.step1')}</strong> {t('refer.step1b')}</li>
                <li><strong>{t('refer.step2')}</strong> {t('refer.step2b')}</li>
                <li><strong>{t('refer.step3', { rounds: rules.roundsRequired })}</strong> {t('refer.step3b')}</li>
              </ol>
              <p className="analytics-note">
                {t('refer.fine', { max: rules.maxRewarded })}
              </p>
            </section>
          </div>

          <div className="stat-grid">
            <div className="stat-tile"><span className="stat-label">{t('refer.joined')}</span><strong className="stat-value">{page.totals.joined}</strong></div>
            <div className="stat-tile"><span className="stat-label">{t('refer.pending')}</span><strong className="stat-value">{page.totals.pending}</strong></div>
            <div className="stat-tile"><span className="stat-label">{t('refer.earned')}</span><strong className={`stat-value${page.totals.chipsEarned > 0 ? ' is-up' : ''}`}>{number(page.totals.chipsEarned)}</strong></div>
            <div className="stat-tile"><span className="stat-label">{t('refer.left')}</span><strong className="stat-value">{Math.max(0, rules.maxRewarded - page.totals.rewarded)}</strong><small className="stat-note">{t('refer.ofMax', { max: rules.maxRewarded })}</small></div>
          </div>

          <section className="analytics-card" aria-labelledby="friends-heading">
            <h2 id="friends-heading">{t('friends.list.title')}</h2>
            {page.friends.length
              ? (
                <ul className="referral-list">
                  {page.friends.map(friend => (
                    <li key={`${friend.username}-${friend.joinedAt}`}>
                      <span className="referral-who">
                        <strong>{friend.username}</strong>
                        <small>{t('refer.joinedOn', { date: date(friend.joinedAt, DAY_MONTH) })}</small>
                      </span>
                      <Progress progress={friend} roundsRequired={rules.roundsRequired} reward={rules.referrerReward} />
                    </li>
                  ))}
                </ul>
                )
              : <p className="dialog-copy">{t('refer.noOne')}</p>}
          </section>

          {page.referredBy && (
            <section className="analytics-card" aria-labelledby="referred-heading">
              <h2 id="referred-heading">{t('refer.joinedWith', { name: page.referredBy.username })}</h2>
              <ul className="referral-list">
                <li>
                  <span className="referral-who"><strong>{t('refer.welcome')}</strong><small>{t('refer.welcomeNote', { mine: number(rules.friendReward), theirs: number(rules.referrerReward), name: page.referredBy.username })}</small></span>
                  <Progress progress={page.referredBy} roundsRequired={rules.roundsRequired} reward={rules.friendReward} />
                </li>
              </ul>
              {page.referredBy.status === 'PENDING' && !page.referredBy.savedAccount && (
                <button type="button" className="btn-gold small" onClick={onSaveAccount}>{t('menu.saveAccount')}</button>
              )}
            </section>
          )}

          {page.canEnterCode && (
            <section className="analytics-card" aria-labelledby="enter-heading">
              <h2 id="enter-heading">{t('refer.gotCode')}</h2>
              <p className="analytics-note">{t('refer.enterBy', { date: date(page.enterCodeUntil, DAY_MONTH), amount: number(rules.friendReward) })}</p>
              <form className="refer-enter" onSubmit={event => { void claim(event) }}>
                <input
                  value={friendCode}
                  onChange={event => setFriendCode(event.target.value.toUpperCase())}
                  placeholder={t('refer.placeholder')}
                  aria-label={t('refer.friendCode')}
                  maxLength={16}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="submit" className="btn-gold small" disabled={claiming || friendCode.trim().length < 4}>{claiming ? t('refer.applying') : t('refer.apply')}</button>
              </form>
              {claimFailure && <p className="form-error" role="alert">{claimFailure}</p>}
            </section>
          )}
        </>
      )}
    </main>
  )
}
