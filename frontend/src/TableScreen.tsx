import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react'
import { pocketColor, type Bet, type BetSelection, type Pocket, type Seat, type VariantName } from '@roulette/engine'
import { seatOf, type ActionResult, type GameTransport, type TableState } from '@roulette/game-client'
import { Board, type OtherStake } from './Board'
import { ResultOverlay } from './ResultOverlay'
import { Wheel3D, type Announcement, type SpinRequest, type TableView } from './Wheel3D'
import { unlockSpeech } from './dealer/speech'
import { DEALERS, type DealerKind } from './dealer/types'
import { CHIPS, betKey, totalOf } from './game'
import { playChip, playResult } from './audio'
import { tapFeedback, winFeedback } from './native'
import { useTable } from './useTable'
import { Seats } from './Seats'
import { translate, useT } from './i18n'
import { setPreferences, usePreferences } from './preferences'
import { readSetting, writeSetting } from './settings'
import { ChatPanel } from './ChatPanel'
import { PHONE_PORTRAIT, useMediaQuery } from './useMediaQuery'
import { ShareInvite } from './ShareInvite'
import { Lobby } from './Lobby'

type Phase = 'betting' | 'spinning' | 'result'
/** On phones the board and the wheel are pages side by side, swiped between. */
type Page = 'board' | 'wheel'

export const VARIANT_INFO: Record<VariantName, { title: string, pockets: number, edge: string, blurb: string }> = {
  AMERICAN: { title: 'American', pockets: 38, edge: '5.26%', blurb: 'Double zero · top line pays 6:1' },
  ENGLISH: { title: 'European', pockets: 37, edge: '2.70%', blurb: 'Single zero · first four pays 8:1' }
}

const REVEAL_DELAY_MS = 900
/** How far a sideways swipe must travel to turn the page on phones. */
const SWIPE_MIN_PX = 40
/** In dealer view the croupier calls the number before the reveal covers her. */
const DEALER_REVEAL_DELAY_MS = 3200

/** The croupier's line for local winners when several people share the device. */
function callWinners (winners: { name: string, net: number }[]) {
  if (!winners.length) return ''
  return ' ' + winners.map(({ name, net }) => name === 'You' ? translate('dealer.youWin', { net }) : translate('dealer.playerWins', { name, net })).join(' ')
}

/** What a croupier says when the ball lands, e.g. "17, red, odd." */
function callNumber (pocket: Pocket) {
  if (pocket === '0') return translate('dealer.zero')
  if (pocket === '00') return translate('dealer.doubleZero')
  return translate('dealer.call', { pocket, color: translate(`color.${pocketColor(pocket)}`), parity: translate(Number(pocket) % 2 ? 'parity.odd' : 'parity.even') })
}

/** Whole seconds until a deadline, ticking once a second while there is one. */
function useSecondsLeft (deadline: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (deadline === null) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [deadline])
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))
}

interface Props {
  transport: GameTransport
  /** e.g. "Private room · AB12CD". */
  label: string
  /** Leaves the table (the transport has been left or the room has ended). */
  onExit: (final: TableState) => void
  /** Renders the top bar with the balance this table should show. */
  topBar: (balance: { label: string, value: number }) => ReactNode
  /** Online only: the connection dropped and is being restored. */
  reconnecting?: boolean
  /** Private tables: the code to invite friends with; `open` shows the invite right away. */
  invite?: { code: string, open: boolean }
}

/**
 * One roulette table, offline or online: the UI only talks to the GameTransport. Offline the
 * player spins and moves to the next round; online the server runs both on its own clock.
 */
export function TableScreen ({ transport, label, onExit, topBar, reconnecting = false, invite }: Props) {
  const table = useTable(transport)!
  const serverPaced = !transport.controlsPace
  const variant = table.variant
  const [chip, setChip] = useState<number>(25)
  /** Each local player's bets from their last round, for Repeat. */
  const [lastBets, setLastBets] = useState<Record<string, Bet[]>>({})
  /** Whose result the reveal shows. */
  const [revealFor, setRevealFor] = useState<string | null>(null)
  const [spinRequest, setSpinRequest] = useState<SpinRequest | null>(null)
  /** The round whose ball has landed; until then its result stays hidden. */
  const [landedRound, setLandedRound] = useState<number | null>(null)
  const [showReveal, setShowReveal] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [inviting, setInviting] = useState(invite?.open ?? false)
  const [tableView, setTableView] = useState<TableView>(() => readSetting('roulette.view', 'wheel') === 'dealer' ? 'dealer' : 'wheel')
  const [dealerKind, setDealerKind] = useState<DealerKind>(() => {
    const stored = readSetting('roulette.dealer', 'noir')
    return stored in DEALERS ? stored : 'noir'
  })
  const preferences = usePreferences()
  const voiceMuted = !preferences.voice
  // Tell an online table whether its chat may mention my bets (the seat starts out sharing).
  const shareBets = preferences.shareBets
  useEffect(() => { void transport.setShareBets?.(shareBets) }, [transport, shareBets])
  const t = useT()
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const announcementId = useRef(0)
  const tableViewRef = useRef(tableView)
  tableViewRef.current = tableView
  const spinCounter = useRef(0)
  const spinRef = useRef<(SpinRequest & { round: number }) | null>(null)
  const phone = useMediaQuery(PHONE_PORTRAIT)
  const [page, setPage] = useState<Page>('board')
  const pagesRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLElement>(null)
  const wheelRef = useRef<HTMLElement>(null)

  const seat = seatOf(table)
  const bets = seat.bets
  const result = table.result
  const settlement = result ? result.settlements[table.me] ?? null : null
  // The transport settles as soon as the wheel is spun; the table shows it once the ball lands.
  const phase: Phase = table.phase === 'BETTING' ? 'betting' : landedRound === result?.round ? 'result' : 'spinning'
  const shownBalance = (target: Seat) => phase === 'spinning' && result ? target.balance - (result.settlements[target.playerId]?.totalPayout ?? 0) : target.balance
  const balance = shownBalance(seat)
  const myLastBets = lastBets[table.me] ?? []
  const tableStaked = table.seats.reduce((sum, other) => sum + totalOf(other.bets), 0)
  const multiplayer = table.seats.length > 1
  const sharedDevice = table.localPlayers.length > 1
  const reveal = result && revealFor && result.settlements[revealFor] ? { settlement: result.settlements[revealFor], seat: seatOf(table, revealFor) } : null
  const history = (phase === 'spinning' ? table.history.slice(1) : table.history).slice(0, 14)
  const staked = totalOf(bets)
  const secondsLeft = useSecondsLeft(serverPaced ? table.phaseEndsAt : null)

  const announce = useCallback((text: string, gesture?: Announcement['gesture']) => {
    announcementId.current += 1
    setAnnouncement({ id: announcementId.current, text, gesture })
  }, [])

  // A newly published result sends the ball on its way to the winning pocket.
  const resultRound = result?.round ?? null
  const resultPocket = result?.pocket
  useEffect(() => {
    if (resultRound === null || resultPocket === undefined) return
    spinCounter.current += 1
    const request = { id: spinCounter.current, pocket: resultPocket }
    spinRef.current = { ...request, round: resultRound }
    setSpinRequest(request)
    announce(translate('dealer.noMoreBets'))
  }, [resultRound, resultPocket, announce])

  // Online, the server opens the next round on its own: clear the reveal and invite bets.
  const bettingRound = table.phase === 'BETTING' ? table.round : null
  useEffect(() => {
    if (!serverPaced || bettingRound === null) return
    setShowReveal(false)
    announce(translate('dealer.placeBets'))
  }, [serverPaced, bettingRound, announce])

  /** Scrolls the pager to a page; on wider screens both are always in view and this does nothing. */
  const showPage = useCallback((next: Page) => {
    const pages = pagesRef.current
    const target = (next === 'board' ? boardRef : wheelRef).current
    if (!pages || !target || pages.scrollWidth <= pages.clientWidth) return
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    pages.scrollTo({ left: target.offsetLeft, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // The table follows the round: the wheel when it spins, the board when bets open again.
  // Between those moments the player can swipe wherever they like.
  const followedPhase = useRef<Phase>('betting')
  useEffect(() => {
    if (phase === followedPhase.current) return
    followedPhase.current = phase
    if (phase === 'spinning') showPage('wheel')
    else if (phase === 'betting') showPage('board')
  }, [phase, showPage])

  // Native snapping alone needs a drag past half the screen; a short, clearly
  // sideways swipe should turn the page too, as it does in other apps.
  const swipeStart = useRef<{ x: number, y: number } | null>(null)

  function startSwipe (event: ReactTouchEvent) {
    const touch = event.touches[0]
    // The seats row scrolls sideways by itself.
    swipeStart.current = event.touches.length === 1 && !(event.target as Element).closest('.seats') ? { x: touch.clientX, y: touch.clientY } : null
  }

  function endSwipe (event: ReactTouchEvent) {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start || event.touches.length) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return
    showPage(dx < 0 ? 'wheel' : 'board')
  }

  function trackPage () {
    const pages = pagesRef.current
    const wheel = wheelRef.current
    if (!pages || !wheel) return
    const middle = pages.scrollLeft + pages.clientWidth / 2
    setPage(middle >= wheel.offsetLeft && middle < wheel.offsetLeft + wheel.offsetWidth ? 'wheel' : 'board')
  }

  function changeView (next: TableView) {
    if (next === 'dealer') unlockSpeech()
    setTableView(next)
    writeSetting('roulette.view', next)
  }

  function changeDealer (next: DealerKind) {
    setDealerKind(next)
    writeSetting('roulette.dealer', next)
  }

  function toggleVoice () {
    if (preferences.voice && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    setPreferences({ voice: !preferences.voice })
  }

  const amounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const bet of bets) map.set(betKey(bet), (map.get(betKey(bet)) ?? 0) + bet.amount)
    return map
  }, [bets])

  const others = useMemo(() => {
    const stakes: OtherStake[] = []
    for (const other of table.seats) {
      if (other.playerId === table.me) continue
      for (const key of new Set(other.bets.map(betKey))) stakes.push({ key, seat: other.seat })
    }
    return stakes
  }, [table])

  const ERROR_NOTICES: Partial<Record<string, string>> = {
    BettingClosed: t('table.betsClosed'),
    InsufficientFunds: t('table.insufficient'),
    BetLimit: t('table.overLimit'),
    NetworkError: t('table.network')
  }

  function act (action: Promise<ActionResult>, sound = false) {
    void action.then(outcome => {
      if (outcome.ok) {
        if (sound) {
          playChip()
          tapFeedback()
        }
        return
      }
      const message = ERROR_NOTICES[outcome.error]
      if (message) setNotice(message)
    })
  }

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  function placeBet (selection: BetSelection) {
    if (phase !== 'betting' || balance < chip) return
    act(transport.placeBet({ ...selection, amount: chip }), true)
  }

  function undo () {
    if (phase !== 'betting' || !bets.length) return
    act(transport.undo())
  }

  function clear () {
    if (phase !== 'betting' || !bets.length) return
    act(transport.clear())
  }

  function rebet (source: Bet[]) {
    if (phase !== 'betting' || !source.length || totalOf(source) > balance) return
    act(transport.placeBets(source.map(bet => ({ ...bet }))), true)
  }

  function startSpin () {
    if (serverPaced || phase !== 'betting' || !tableStaked) return
    act(transport.spin())
  }

  const onSettled = useCallback((id: number) => {
    const request = spinRef.current
    if (!request || request.id !== id) return
    spinRef.current = null
    const state = transport.getState()
    if (!state.result || state.result.round !== request.round) return
    const { settlements } = state.result
    setLandedRound(request.round)
    const played = state.localPlayers.filter(playerId => settlements[playerId]?.results.length)
    setLastBets(current => {
      const next = { ...current }
      for (const playerId of played) next[playerId] = settlements[playerId].results.map(({ bet }) => bet)
      return next
    })
    // Online, a round you sat out has nothing to reveal.
    if (serverPaced && !played.length) {
      announce(callNumber(request.pocket))
      return
    }
    // The reveal follows the player holding the device, or whoever on it actually bet.
    const subject = played.includes(state.me) ? state.me : played[0] ?? state.me
    setRevealFor(subject)
    const mine = settlements[subject]
    const net = mine.totalPayout - mine.totalStake
    const big = mine.totalPayout >= mine.totalStake * 8 && net > 0
    const winners = played
      .map(playerId => ({ name: seatOf(state, playerId).name, net: settlements[playerId].totalPayout - settlements[playerId].totalStake }))
      .filter(winner => winner.net > 0)
    const call = state.localPlayers.length > 1
      ? callWinners(winners)
      : net > 0 ? ` ${translate(big ? 'dealer.magnificent' : 'dealer.congrats', { net })}` : ''
    announce(`${callNumber(request.pocket)}${call}`, net > 0 ? 'cheer' : winners.length ? 'wave' : net < 0 ? 'sympathy' : 'talk')
    window.setTimeout(() => {
      setShowReveal(true)
      playResult(net > 0, big)
      if (net > 0) winFeedback(big)
    }, tableViewRef.current === 'dealer' ? DEALER_REVEAL_DELAY_MS : REVEAL_DELAY_MS)
  }, [announce, serverPaced, transport])

  const nextRound = useCallback(() => {
    setShowReveal(false)
    if (serverPaced) return
    act(transport.nextRound())
    announce(translate('dealer.placeBets'))
  }, [announce, serverPaced, transport])

  function leave () {
    transport.leave()
    onExit(transport.getState())
  }

  function selectPlayer (playerId: string) {
    act(transport.selectPlayer(playerId))
  }

  const info = VARIANT_INFO[variant]
  const status = phase === 'spinning'
    ? { eyebrow: t('status.noMoreBets'), title: t('status.ballRolling') }
    : phase === 'result' && result
      ? { eyebrow: t('status.result'), title: `${result.pocket} ${t(`color.${pocketColor(result.pocket)}` as const)}` }
      : { eyebrow: t('status.placeBets'), title: bets.length ? t('status.onTable', { amount: staked.toLocaleString() }) : t('status.chooseChip') }

  // Online the big button is a clock: the server spins and deals the next round.
  const paceLabel = phase === 'betting'
    ? table.phaseEndsAt === null ? t('table.dealingSoon') : t('table.betsClose', { seconds: secondsLeft ?? 0 })
    : phase === 'spinning' ? t('table.spinning') : t('table.nextRoundIn', { seconds: secondsLeft ?? '–' })

  const shareSheet = invite && inviting && <ShareInvite code={invite.code} variant={variant} from={seat.name} onClose={() => setInviting(false)} />
  const chat = transport.sendChat && transport.sendReaction && transport.reportChat && !table.closed && (
    <ChatPanel messages={table.chat ?? []} me={table.me} send={transport.sendChat} react={transport.sendReaction} showBets={preferences.chatBets} report={transport.reportChat} />
  )

  // A private table before its host starts it: the waiting room instead of the felt.
  if (table.lobby?.waiting && !table.closed) {
    const { startGame } = transport
    return (
      <>
        {topBar({ label: t('table.balance'), value: balance })}
        <main className="table-screen">
          {reconnecting && (
            <p className="connection-banner" role="status">{t('table.reconnectingLobby')}</p>
          )}
          <div className="table-head">
            <button type="button" className="btn-ghost small" onClick={leave}>{t('table.leave')}</button>
            <div>
              <p className="eyebrow">{label}</p>
              <h1 className="table-title">{t(`variant.${variant}` as const)} <em>{t('table.titleSuffix')}</em></h1>
            </div>
          </div>
          <Lobby
            table={table}
            onInvite={() => setInviting(true)}
            onStart={table.lobby.isHost && startGame ? async () => (await startGame()).ok : undefined}
          />
        </main>
        {shareSheet}
        {chat}
      </>
    )
  }

  return (
    <>
      {topBar({ label: sharedDevice ? seat.name : t('table.balance'), value: balance })}
      <main className="table-screen">
        {reconnecting && (
          <p className="connection-banner" role="status">{t('table.reconnecting')}</p>
        )}
        <div className="table-head">
          <button type="button" className="btn-ghost small" onClick={leave}>{t('table.leave')}</button>
          <div>
            <p className="eyebrow">{label}</p>
            <h1 className="table-title">{t(`variant.${variant}` as const)} <em>{t('table.titleSuffix')}</em></h1>
            {invite && <button type="button" className="btn-ghost small invite-button" onClick={() => setInviting(true)}>{t('table.inviteFriends')}</button>}
          </div>
          <div className="history" aria-label={t('table.recent')}>
            {history.length === 0 && <span className="history-empty">{t('table.noSpins')}</span>}
            {history.map((pocket, i) => <span key={`${pocket}-${i}`} className={`history-pocket pocket-${pocketColor(pocket)}`}>{pocket}</span>)}
          </div>
        </div>

        <div className="page-tabs">
          <div className="view-switch" role="tablist" aria-label={t('table.show')}>
            {(['board', 'wheel'] as const).map(option => (
              <button key={option} type="button" role="tab" id={`tab-${option}`} aria-controls={`page-${option}`} aria-selected={page === option} className={page === option ? 'is-active' : ''} onClick={() => showPage(option)}>
                {option === 'board' ? t('table.board') : t('table.wheel')}
              </button>
            ))}
          </div>
          <p className={`page-clock${serverPaced && phase === 'betting' && (secondsLeft ?? 99) <= 5 ? ' is-urgent' : ''}`} role="timer" aria-live="off">
            {serverPaced ? paceLabel : status.eyebrow}
          </p>
        </div>

        <div className="table-layout" ref={pagesRef} onScroll={trackPage} onTouchStart={startSwipe} onTouchEnd={endSwipe} onTouchCancel={() => { swipeStart.current = null }}>
          <section className="wheel-panel" id="page-wheel" ref={wheelRef} aria-label={t('table.wheelAria')}>
            <div className="view-bar">
              <div className="view-switch" role="tablist" aria-label={t('table.view')}>
                {(['wheel', 'dealer'] as const).map(option => (
                  <button key={option} type="button" role="tab" aria-selected={tableView === option} className={tableView === option ? 'is-active' : ''} onClick={() => changeView(option)}>
                    {option === 'wheel' ? t('table.wheel') : t('table.dealer')}
                  </button>
                ))}
              </div>
              {tableView === 'dealer' && (
                <div className="dealer-tools">
                  <select className="dealer-select" aria-label={t('table.dealer')} value={dealerKind} onChange={event => changeDealer(event.target.value as DealerKind)}>
                    {(Object.keys(DEALERS) as DealerKind[]).map(kind => <option key={kind} value={kind}>{t('table.dealerLabel', { label: DEALERS[kind].label })}</option>)}
                  </select>
                  <button type="button" className="voice-toggle" onClick={toggleVoice} aria-pressed={!voiceMuted}>
                    {voiceMuted ? t('table.voiceOff') : t('table.voiceOn')}
                  </button>
                </div>
              )}
            </div>
            <Wheel3D variant={variant} spin={spinRequest} onSettled={onSettled} restingPocket={phase === 'spinning' ? undefined : table.history[0]} view={tableView} dealer={dealerKind} announcement={announcement} muted={voiceMuted} interactive={!phone} />
            <div className={`status status-${phase}`}>
              <p className="eyebrow">{status.eyebrow}</p>
              <p className="status-title">{status.title}</p>
            </div>
          </section>

          <section className="felt-panel" id="page-board" ref={boardRef} aria-label={t('table.boardAria')}>
            {multiplayer && (
              <Seats seats={table.seats} me={table.me} localPlayers={table.localPlayers} settlements={phase === 'result' ? result?.settlements ?? null : null} balanceOf={shownBalance} onSelect={selectPlayer} />
            )}
            <Board variant={variant} amounts={amounts} others={others} disabled={phase !== 'betting'} winningPocket={phase === 'result' ? settlement?.winningPocket ?? result?.pocket ?? null : null} onBet={placeBet} />
            {notice && <p className="table-notice" role="status">{notice}</p>}
            <div className="controls">
              <div className="chip-tray" role="radiogroup" aria-label={t('table.chipValue')}>
                {CHIPS.map(value => (
                  <button key={value} type="button" role="radio" aria-checked={chip === value} className={`chip chip-${value}${chip === value ? ' is-selected' : ''}`} disabled={value > balance && phase === 'betting'} onClick={() => setChip(value)}>
                    {value}
                  </button>
                ))}
              </div>
              <div className="actions">
                <button type="button" className="btn-ghost small" onClick={undo} disabled={phase !== 'betting' || !bets.length}>{t('table.undo')}</button>
                <button type="button" className="btn-ghost small" onClick={clear} disabled={phase !== 'betting' || !bets.length}>{t('table.clear')}</button>
                <button type="button" className="btn-ghost small" onClick={() => rebet(bets.length ? bets : myLastBets)} disabled={phase !== 'betting' || (!bets.length && !myLastBets.length)}>
                  {bets.length ? t('table.double') : t('table.repeat')}
                </button>
                {serverPaced
                  ? <div className={`btn-gold spin pace-clock${phase === 'betting' && (secondsLeft ?? 99) <= 5 ? ' is-urgent' : ''}`} role="timer" aria-live="off">{paceLabel}</div>
                  : (
                    <button type="button" className="btn-gold spin" onClick={phase === 'result' ? nextRound : startSpin} disabled={phase === 'spinning' || (phase === 'betting' && !tableStaked)}>
                      {phase === 'spinning' ? t('table.spinning') : phase === 'result' ? t('result.next') : t('table.spin')}
                    </button>
                    )}
              </div>
            </div>
            <p className="fine-print">{t(variant === 'AMERICAN' ? 'table.payoutsAmerican' : 'table.payouts')}</p>
          </section>
        </div>
      </main>
      {shareSheet}

      {chat}

      {showReveal && reveal && !table.closed && <ResultOverlay settlement={reveal.settlement} playerName={sharedDevice ? reveal.seat.name : undefined} onClose={nextRound} />}

      {table.closed && table.summary && (
        <div className="dialog-backdrop" role="presentation">
          <section className="dialog summary" role="dialog" aria-modal="true" aria-labelledby="summary-title">
            <p className="eyebrow">{t('summary.eyebrow')}</p>
            <h2 id="summary-title">{t('summary.title')}</h2>
            <table className="summary-table">
              <thead><tr><th scope="col">{t('leaderboard.player')}</th><th scope="col">{t('leaderboard.rounds')}</th><th scope="col">{t('summary.staked')}</th><th scope="col">{t('leaderboard.net')}</th><th scope="col">{t('leaderboard.best')}</th></tr></thead>
              <tbody>
                {table.summary.map(row => (
                  <tr key={row.roomPlayerId} className={String(row.roomPlayerId) === table.me ? 'is-me' : ''}>
                    <td>{row.name}</td>
                    <td>{Number(row.roundsPlayed)}</td>
                    <td>{Number(row.staked).toLocaleString()}</td>
                    <td className={Number(row.net) > 0 ? 'is-up' : Number(row.net) < 0 ? 'is-down' : ''}>{Number(row.net) > 0 ? '+' : ''}{Number(row.net).toLocaleString()}</td>
                    <td>{Number(row.biggestWin).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="btn-gold" onClick={() => onExit(table)}>{t('summary.back')}</button>
          </section>
        </div>
      )}
    </>
  )
}
