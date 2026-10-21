import { useEffect, useState } from 'react'
import { pocketColor } from '@roulette/engine'
import type { HistoryRound } from '@roulette/contracts'
import { useI18n, type MessageKey } from './i18n'
import { errorMessage, useSession } from './session'

const PAGE_SIZE = 20
const WHEN: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }

/** Every online round the player had chips on, newest first. */
export function HistoryScreen () {
  const { api } = useSession()
  const { t, number, date } = useI18n()
  const [rounds, setRounds] = useState<HistoryRound[]>([])
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.history({ limit: PAGE_SIZE, pageNo: page })
      .then(({ rounds: next }) => {
        if (cancelled) return
        setRounds(current => page === 1 ? next : [...current, ...next])
        setMore(next.length === PAGE_SIZE)
      })
      .catch(failure => { if (!cancelled) setError(errorMessage(failure)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [api, page])

  return (
    <main className="page">
      <section className="page-head">
        <p className="eyebrow">{t('history.eyebrow')}</p>
        <h1 className="page-title">{t('history.titleA')} <em>{t('history.titleB')}</em></h1>
        <p className="lede">{t('history.lede')}</p>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <ol className="history-list">
        {rounds.map(round => (
          <li key={round.roundId}>
            <span className={`history-pocket pocket-${pocketColor(round.winningPocket)}`}>{round.winningPocket}</span>
            <span className="history-where">
              <strong>{t(`variant.${round.variant}` as MessageKey)} · {t(`history.mode.${round.mode}` as MessageKey)}</strong>
              <small>{t('history.meta', { code: round.code, round: round.roundNumber, when: date(round.resultAt, WHEN) })}</small>
            </span>
            <span className="history-staked">{t('history.staked', { amount: number(round.staked) })}</span>
            <span className={`history-net ${round.net > 0 ? 'is-up' : round.net < 0 ? 'is-down' : ''}`}>{round.net > 0 ? '+' : ''}{number(round.net)}</span>
          </li>
        ))}
      </ol>
      {!loading && !rounds.length && !error && <p className="dialog-copy">{t('history.empty')}</p>}
      {more && <button type="button" className="btn-ghost small" disabled={loading} onClick={() => setPage(next => next + 1)}>{loading ? t('common.loading') : t('common.showMore')}</button>}
    </main>
  )
}
