import { useEffect, useState } from 'react'
import type { Leaderboard, LeaderboardEntry, LeaderboardPeriod } from '@roulette/contracts'
import { useI18n } from './i18n'
import { errorMessage, useSession } from './session'

const PERIODS: LeaderboardPeriod[] = ['day', 'week', 'all']

function Row ({ entry, mine }: { entry: LeaderboardEntry, mine: boolean }) {
  const { t, number } = useI18n()
  return (
    <tr className={mine ? 'is-me' : ''}>
      <td className={`rank${entry.rank <= 3 ? ` is-top rank-${entry.rank}` : ''}`}>{entry.rank}</td>
      <td>{entry.username}{mine && <small> {t('leaderboard.you')}</small>}</td>
      <td className={entry.net > 0 ? 'is-up' : entry.net < 0 ? 'is-down' : ''}>{entry.net > 0 ? '+' : ''}{number(entry.net)}</td>
      <td>{number(entry.rounds)}</td>
      <td>{number(entry.biggestWin)}</td>
    </tr>
  )
}

/** Players ranked by net winnings, with the player's own place even outside the top 50. */
export function LeaderboardScreen () {
  const { api, player } = useSession()
  const { t } = useI18n()
  const [period, setPeriod] = useState<LeaderboardPeriod>('week')
  const [board, setBoard] = useState<Leaderboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setBoard(null)
    setError(null)
    api.leaderboard(period).then(next => { if (!cancelled) setBoard(next) }).catch(failure => { if (!cancelled) setError(errorMessage(failure)) })
    return () => { cancelled = true }
  }, [api, period])

  const meOutsideTop = board?.me && !board.entries.some(entry => entry.playerId === board.me!.playerId)

  return (
    <main className="page">
      <section className="page-head">
        <p className="eyebrow">{t('leaderboard.eyebrow')}</p>
        <h1 className="page-title">{t('leaderboard.titleA')} <em>{t('leaderboard.titleB')}</em></h1>
        <p className="lede">{t('leaderboard.lede')}</p>
        <div className="view-switch" role="tablist" aria-label={t('analytics.period')}>
          {PERIODS.map(option => (
            <button key={option} type="button" role="tab" aria-selected={period === option} className={period === option ? 'is-active' : ''} onClick={() => setPeriod(option)}>
              {t(`leaderboard.${option}` as const)}
            </button>
          ))}
        </div>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {board && (
        board.entries.length
          ? (
            <table className="summary-table leaderboard">
              <thead><tr><th scope="col">#</th><th scope="col">{t('leaderboard.player')}</th><th scope="col">{t('leaderboard.net')}</th><th scope="col">{t('leaderboard.rounds')}</th><th scope="col">{t('leaderboard.best')}</th></tr></thead>
              <tbody>
                {board.entries.map(entry => <Row key={entry.playerId} entry={entry} mine={entry.playerId === player?.playerId} />)}
                {meOutsideTop && board.me && (
                  <>
                    <tr className="gap" aria-hidden="true"><td colSpan={5}>⋯</td></tr>
                    <Row entry={board.me} mine />
                  </>
                )}
              </tbody>
            </table>
            )
          : <p className="dialog-copy">{t('leaderboard.empty')}</p>
      )}
    </main>
  )
}
