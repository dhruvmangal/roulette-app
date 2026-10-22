import { useCallback, useEffect, useRef, useState } from 'react'
import { BOT_NAMES, BOT_STYLES, type VariantName } from '@roulette/engine'
import type { MyTable, RoomMode } from '@roulette/contracts'
import { LocalTransport, LocalWalletAdapter, SocketTransport, seatOf, type GameTransport, type LocalPlayer, type TableState } from '@roulette/game-client'
import type { Socket } from 'socket.io-client'
import { secureRandomInt } from './game'
import { TableSetup, fitSetup, type SetupChoice } from './TableSetup'
import { TableScreen } from './TableScreen'
import { HomeScreen } from './HomeScreen'
import { WalletScreen } from './WalletScreen'
import { BonusesScreen } from './BonusesScreen'
import { HistoryScreen } from './HistoryScreen'
import { AnalyticsScreen } from './AnalyticsScreen'
import { LearnScreen } from './LearnScreen'
import { ReferScreen } from './ReferScreen'
import { SettingsScreen } from './SettingsScreen'
import { LeaderboardScreen } from './LeaderboardScreen'
import { OnlineDialog, type OnlineChoice, type OnlineMode } from './OnlineDialog'
import { SaveAccountDialog, SignInDialog } from './SignInDialog'
import { TopBar, type Screen } from './TopBar'
import { routeForPath, routeForScreen } from './routes'
import { applyRouteMeta } from './seo'
import { SessionProvider, errorMessage, useSession } from './session'
import { SocialProvider, useSocial } from './social'
import { AchievementsScreen } from './AchievementsScreen'
import { FriendsScreen } from './FriendsScreen'
import { translate, useI18n, type MessageKey } from './i18n'
import { isNativeApp, platform } from './platform'
import { onPushOpened, syncPush } from './push'
import { readSetting, writeSetting } from './settings'
import { onAppLink, onBackButton, startNative, watchNetwork } from './native'
import type { DeepLink } from './deepLink'
import { discordLogin, inDiscord } from './discord'
import { clearPendingReferral, keepReferral, pendingReferral, takeLinkFromUrl } from './invite'

const STARTING_BALANCE = 1000
const PLAYER_ID = 'local-player'
const DEFAULT_SETUP: Omit<SetupChoice, 'variant'> = { guests: [], bots: 3 }
const SOCKET_WAIT_MS = 8000

function readSetup (): Omit<SetupChoice, 'variant'> {
  try {
    const stored = JSON.parse(readSetting('roulette.setup', 'null'))
    if (stored && Array.isArray(stored.guests) && stored.guests.every((name: unknown) => typeof name === 'string') && Number.isInteger(stored.bots)) {
      return fitSetup({ variant: 'AMERICAN', guests: stored.guests, bots: stored.bots })
    }
  } catch { /* fall back to the default table */ }
  return DEFAULT_SETUP
}

/** Everyone at an offline table: you first, then guests sharing the device, then computer players. */
function seatPlayers ({ guests, bots }: SetupChoice, practiceChips: number): LocalPlayer[] {
  return [
    { id: PLAYER_ID, name: 'You', balance: practiceChips },
    ...guests.map((name, i) => ({ id: `guest-${i + 1}`, name, balance: STARTING_BALANCE })),
    ...Array.from({ length: bots }, (_, i) => ({ id: `bot-${i + 1}`, name: BOT_NAMES[i % BOT_NAMES.length], balance: STARTING_BALANCE, bot: BOT_STYLES[i % BOT_STYLES.length] }))
  ]
}

const deviceStorage = () => {
  try { return window.localStorage } catch { return null }
}

function tableLabel ({ mode, code }: { mode: RoomMode, code: string }) {
  if (mode === 'VS_COMPUTER') return translate('label.computer')
  if (mode === 'PRIVATE') return translate('label.private', { code })
  return translate('label.public', { code })
}

export function App () {
  return (
    <SessionProvider>
      <SocialProvider>
        <Roulette />
      </SocialProvider>
    </SessionProvider>
  )
}

interface OpenTable {
  transport: GameTransport
  label: string
  online: boolean
  /** Private tables: friends join with this code. */
  invite?: { code: string, open: boolean }
}

/** The invite for a private table; it opens by itself for the player who just created it. */
const inviteFor = ({ mode, code }: { mode: RoomMode, code: string }, created = false) =>
  mode === 'PRIVATE' ? { code, open: created } : undefined

// Read once when the page loads; the address is cleaned so a reload doesn't repeat it.
const initialLink = takeLinkFromUrl()

function Roulette () {
  const session = useSession()
  const { t } = useI18n()
  const social = useSocial()
  const [screen, setScreen] = useState<Screen>(() => routeForPath(window.location.pathname)?.screen ?? 'home')
  const [table, setTable] = useState<OpenTable | null>(null)
  const [practice] = useState(() => new LocalWalletAdapter({ storage: deviceStorage(), startingBalance: STARTING_BALANCE }))
  const [practiceBalance, setPracticeBalance] = useState(() => practice.getBalance() ?? STARTING_BALANCE)
  const [setup, setSetup] = useState(readSetup)
  const [setupVariant, setSetupVariant] = useState<VariantName | null>(null)
  const [onlineMode, setOnlineMode] = useState<OnlineMode | null>(null)
  const [onlineBusy, setOnlineBusy] = useState(false)
  const [onlineError, setOnlineError] = useState<string | null>(null)
  /** A code to fill in when the private table dialog opens (from an invite link that failed). */
  const [joinCode, setJoinCode] = useState<string | null>(null)
  /** Sign-in is open; `then` continues what the player was doing. */
  const [signIn, setSignIn] = useState<{ reason?: MessageKey, then: () => void } | null>(null)
  const [savingAccount, setSavingAccount] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  /** Online tables the player still has a seat at (after a reload, a closed tab, a crash). */
  const [seatedAt, setSeatedAt] = useState<MyTable[]>([])
  // Tables left this session: the server may not have processed the leave by the
  // time home asks which seats are still held.
  const leftRooms = useRef(new Set<number>())
  const socketRef = useRef<Socket | null>(session.socket)
  socketRef.current = session.socket
  const [networkOnline, setNetworkOnline] = useState(true)

  useEffect(() => { void startNative() }, [])

  // The address follows the screen (so every page has a link of its own and the
  // browser's back button works), and the screen follows the address.
  // Redirects (an unknown address, a sign-in-only page opened while signed out) replace the entry instead of adding one, so back never lands on them.
  const replaceUrl = useRef(true)
  useEffect(() => {
    const route = routeForScreen(screen)
    if (routeForPath(window.location.pathname) !== route) {
      window.history[replaceUrl.current ? 'replaceState' : 'pushState'](null, '', route.path + window.location.search)
    }
    replaceUrl.current = false
    applyRouteMeta(route)
  }, [screen])
  useEffect(() => {
    const onPop = () => setScreen(routeForPath(window.location.pathname)?.screen ?? 'home')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => watchNetwork(setNetworkOnline), [])

  useEffect(() => practice.subscribe(balance => setPracticeBalance(balance ?? STARTING_BALANCE)), [practice])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  // Signing out ends any online table and the account-only screens.
  useEffect(() => {
    if (session.status !== 'signedOut') return
    setTable(current => {
      if (current?.online) current.transport.leave()
      return current?.online ? null : current
    })
    setScreen(current => {
      if (current === 'home' || current === 'learn' || current === 'settings') return current
      replaceUrl.current = true
      return 'home'
    })
  }, [session.status, screen])

  // Back on the home screen: are there tables still holding a seat for this player?
  const { api, status } = session
  useEffect(() => {
    if (status !== 'signedIn' || table || screen !== 'home') {
      if (status !== 'signedIn') setSeatedAt([])
      return
    }
    let cancelled = false
    api.myTables()
      .then(({ tables }) => { if (!cancelled) setSeatedAt(tables.filter(seat => !leftRooms.current.has(seat.roomId))) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [api, status, table, screen])

  // Things that happen while the player is in the game: a friend request, an accepted one, an achievement.
  useEffect(() => {
    const { notice } = social
    if (!notice) return
    if (notice.kind === 'achievement') setToast(t('notice.achievement', { title: t(`ach.${notice.code}.title` as MessageKey), reward: notice.reward.toLocaleString() }))
    else setToast(t(notice.kind === 'friendRequest' ? 'notice.friendRequest' : 'notice.friendAccepted', { name: notice.from }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [social.notice])

  // Notifications (in the apps): keep this phone registered while signed in, and open what a tap was about.
  const signedInForPush = session.status === 'signedIn'
  useEffect(() => { if (signedInForPush) void syncPush(session.api) }, [signedInForPush, session.api])
  useEffect(() => onPushOpened(data => {
    if (data.screen === 'join' && data.code) setIncoming({ kind: 'join', code: data.code })
    else if (data.screen === 'friends' || data.screen === 'achievements' || data.screen === 'bonuses') navigate(data.screen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  // A link that opened the game: a table invite (sit down at the friend's table,
  // after signing in or starting as a guest) or a friend's referral code (kept
  // until there is an account to claim it with). It comes from the address bar,
  // or from the app being opened by a link; wait for a saved session to load first.
  const [incoming, setIncoming] = useState<DeepLink | null>(initialLink)
  useEffect(() => onAppLink(setIncoming), [])
  // StrictMode runs effects twice in development; each link is handled once.
  const handledLink = useRef<DeepLink | null>(null)
  useEffect(() => {
    if (!incoming || incoming === handledLink.current || session.status === 'loading') return
    handledLink.current = incoming
    setIncoming(null)
    if (incoming.kind === 'join') {
      withAccount('signin.reason.join', () => { void startOnline({ mode: 'join', code: incoming.code }) })
    } else {
      keepReferral(incoming.code)
      setReferral(incoming.code)
      setToast(t('link.referralSaved'))
    }
  })

  // First launch of a fresh install: did this phone open an invite or referral link before installing the app?
  // The server answers only when it is sure; a link the app was launched with comes first and wins.
  useEffect(() => {
    if (!isNativeApp || readSetting('roulette.deferredChecked', '') === '1') return
    const timer = window.setTimeout(() => {
      writeSetting('roulette.deferredChecked', '1')
      session.api.deferredLink(platform === 'ios' ? 'ios' : 'android')
        .then(({ link }) => { if (link && !handledLink.current) setIncoming(link) })
        .catch(() => writeSetting('roulette.deferredChecked', ''))
    }, 2000)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The referral code waits for an account (guest or saved), then is claimed once.
  // The server decides whether it applies (new accounts only), so a refusal is dropped quietly.
  const [referral, setReferral] = useState<string | null>(pendingReferral)
  useEffect(() => {
    if (session.status !== 'signedIn' || !referral) return
    clearPendingReferral()
    setReferral(null)
    session.api.claimReferral(referral)
      .then(() => setToast(t('link.referralJoined')))
      .catch(() => {})
  }, [session.status, session.api, referral])

  /** Runs `then` now if signed in, or after the player signs in. */
  const withAccount = useCallback((reason: MessageKey, then: () => void) => {
    if (session.status === 'signedIn') then()
    else setSignIn({ reason, then })
  }, [session.status])

  function navigate (next: Screen) {
    // Learn is for everyone, signed in or not.
    if (next === 'home' || next === 'learn' || next === 'settings') {
      setScreen(next)
      return
    }
    withAccount(`signin.reason.${next}` as MessageKey, () => setScreen(next))
  }

  function startOffline (choice: SetupChoice) {
    const { variant, ...rest } = choice
    setSetup(rest)
    writeSetting('roulette.setup', JSON.stringify(rest))
    const transport = new LocalTransport({ variant, players: seatPlayers(choice, practiceBalance), randomInt: secureRandomInt })
    setTable({ transport, label: transport.getState().seats.length > 1 ? t('label.offlineSeats', { count: transport.getState().seats.length }) : t('label.offline'), online: false })
    setSetupVariant(null)
  }

  /** The socket once it is connected; it opens right after sign-in. */
  async function connectedSocket (): Promise<Socket> {
    const started = Date.now()
    while (Date.now() - started < SOCKET_WAIT_MS) {
      if (socketRef.current?.connected) return socketRef.current
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error('Could not connect to the game server. Try again in a moment.')
  }

  async function startOnline (choice: OnlineChoice) {
    setOnlineBusy(true)
    setOnlineError(null)
    try {
      const { api } = session
      const state = choice.mode === 'computer'
        ? await api.createRoom({ variant: choice.variant, mode: 'VS_COMPUTER', bots: choice.bots })
        : choice.mode === 'quick'
          ? await api.quickMatch(choice.variant)
          : choice.mode === 'private'
            ? await api.createRoom({ variant: choice.variant, mode: 'PRIVATE', bots: choice.bots })
            : await api.joinRoom(choice.code)
      const transport = await SocketTransport.join(await connectedSocket(), state.room.roomId)
      setTable({ transport, label: tableLabel(state.room), online: true, invite: inviteFor(state.room, choice.mode === 'private') })
      setOnlineMode(null)
    } catch (failure) {
      setOnlineError(errorMessage(failure))
      // Joining from an invite link happens without the dialog; open it so the error shows.
      if (choice.mode === 'join') {
        setJoinCode(choice.code)
        setOnlineMode('private')
      }
    } finally {
      setOnlineBusy(false)
    }
  }

  /** Inside a Discord Activity: sign in with Discord, then sit at the table everyone in the call shares. */
  const [discord, setDiscord] = useState<{ state: 'working' | 'error', error?: string } | null>(inDiscord ? { state: 'working' } : null)
  /** Set once Discord has signed the player in: names the call's table. */
  const [discordInstance, setDiscordInstance] = useState<string | null>(null)
  const discordRun = useRef(0)

  const beginDiscord = useCallback(() => {
    const run = ++discordRun.current
    setDiscord({ state: 'working' })
    setDiscordInstance(null)
    const clientId = session.providers?.discord?.clientId
    if (!clientId) { setDiscord({ state: 'error', error: t('discord.notSetUp') }); return }
    discordLogin(clientId)
      // In Discord the player is who Discord says, whatever session was saved before.
      .then(async ({ code, instanceId }) => { await session.signInWithDiscord(code); return instanceId })
      .then(instanceId => { if (run === discordRun.current) setDiscordInstance(instanceId) })
      .catch(failure => { if (run === discordRun.current) setDiscord({ state: 'error', error: errorMessage(failure) }) })
  }, [session.providers, session.signInWithDiscord, t])

  // Start once the server has said whether Discord is on (the page loads it first).
  const discordStarted = useRef(false)
  useEffect(() => {
    if (!inDiscord || discordStarted.current || !session.providers) return
    discordStarted.current = true
    beginDiscord()
  }, [session.providers, beginDiscord])

  // Once Discord has signed the player in and the game socket is up, sit down.
  useEffect(() => {
    if (!discordInstance || session.status !== 'signedIn' || !session.connected) return
    const run = discordRun.current
    setDiscordInstance(null)
    session.api.joinDiscordTable(discordInstance)
      .then(async state => {
        const transport = await SocketTransport.join(await connectedSocket(), state.room.roomId)
        if (run !== discordRun.current) return
        setTable({ transport, label: tableLabel(state.room), online: true, invite: inviteFor(state.room, false) })
        setDiscord(null)
      })
      .catch(failure => { if (run === discordRun.current) setDiscord({ state: 'error', error: errorMessage(failure) }) })
  }, [discordInstance, session.status, session.connected, session.api])

  async function rejoin (seat: MyTable) {
    try {
      const transport = await SocketTransport.join(await connectedSocket(), seat.roomId)
      setTable({ transport, label: tableLabel(seat), online: true, invite: inviteFor(seat) })
    } catch (failure) {
      setToast(errorMessage(failure))
      setSeatedAt(current => current.filter(other => other.roomId !== seat.roomId))
    }
  }

  async function giveUpSeat (seat: MyTable) {
    leftRooms.current.add(seat.roomId)
    try {
      await session.api.leaveRoom(seat.roomId)
      await session.refreshWallet()
      setToast(t('toast.left'))
    } catch (failure) {
      setToast(errorMessage(failure))
    }
    setSeatedAt(current => current.filter(other => other.roomId !== seat.roomId))
  }

  function exitTable (final: TableState) {
    if (table?.transport instanceof SocketTransport) leftRooms.current.add(table.transport.roomId)
    if (table && !table.online) practice.set(seatOf(final, PLAYER_ID).balance)
    if (table?.online) void session.refreshWallet()
    setTable(null)
    setScreen('home')
  }

  // Android's back button: close the top dialog, then step out of a table or
  // screen. Leaving an online table this way keeps the seat (rejoin from home).
  const backRef = useRef<() => boolean>(() => false)
  backRef.current = () => {
    if (signIn) { setSignIn(null); return true }
    if (savingAccount) { setSavingAccount(false); return true }
    if (onlineMode) { setOnlineMode(null); return true }
    if (setupVariant) { setSetupVariant(null); return true }
    if (table) {
      if (table.transport instanceof SocketTransport) {
        table.transport.detach()
        void session.refreshWallet()
        setTable(null)
      } else {
        table.transport.leave()
        exitTable(table.transport.getState())
      }
      return true
    }
    if (screen !== 'home') { setScreen('home'); return true }
    return false
  }
  useEffect(() => onBackButton(() => backRef.current()), [])

  const topBar = (balance?: { label: string, value: number }) => (
    <TopBar
      balance={balance}
      practiceBalance={practiceBalance}
      onNavigate={next => { if (!table) navigate(next) }}
      onSignIn={() => setSignIn({ then: () => {} })}
      onSaveAccount={() => setSavingAccount(true)}
    />
  )

  if (discord && !table) {
    return (
      <div className="app">
        <main className="page discord-gate" role="status" aria-live="polite">
          <h1 className="page-title">{discord.state === 'error' ? t('discord.failed') : t('discord.connecting')}</h1>
          {discord.error && <p className="form-error" role="alert">{discord.error}</p>}
          {discord.state === 'error' && <button type="button" className="btn-gold" onClick={beginDiscord}>{t('discord.retry')}</button>}
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      {!networkOnline && (!table || table.online) && (
        <p className="offline-banner" role="status">
          You're offline. Online tables need a connection; practice tables don't.
          {!table && <button type="button" className="link-button" onClick={() => setSetupVariant('AMERICAN')}>Practise offline →</button>}
        </p>
      )}
      {table
        ? (
          <TableScreen
            key={String(table.transport.getState().roomCode ?? 'offline') + table.label}
            transport={table.transport}
            label={table.label}
            onExit={exitTable}
            topBar={balance => topBar(balance)}
            reconnecting={table.online && !session.connected}
            invite={table.invite}
          />
          )
        : (
          <>
            {topBar()}
            {screen === 'home' && (
              <HomeScreen
                practiceBalance={practiceBalance}
                seatedAt={seatedAt}
                onRejoin={seat => { void rejoin(seat) }}
                onGiveUpSeat={seat => { void giveUpSeat(seat) }}
                onLeaderboard={() => navigate('leaderboard')}
                onLearn={() => navigate('learn')}
                onRefer={() => navigate('refer')}
                onFriends={() => navigate('friends')}
                onOffline={variant => setSetupVariant(variant)}
                onOnline={mode => withAccount('signin.reason.play', () => { setOnlineError(null); setOnlineMode(mode) })}
              />
            )}
            {screen === 'wallet' && session.status === 'signedIn' && <WalletScreen onBonuses={() => setScreen('bonuses')} />}
            {screen === 'bonuses' && session.status === 'signedIn' && <BonusesScreen onClaimed={amount => setToast(t('toast.chipsAdded', { amount: amount.toLocaleString() }))} />}
            {screen === 'history' && session.status === 'signedIn' && <HistoryScreen />}
            {screen === 'learn' && <LearnScreen />}
            {screen === 'settings' && <SettingsScreen />}
            {screen === 'friends' && session.status === 'signedIn' && <FriendsScreen onJoin={code => { void startOnline({ mode: 'join', code }) }} />}
            {screen === 'achievements' && session.status === 'signedIn' && <AchievementsScreen />}
            {screen === 'refer' && session.status === 'signedIn' && <ReferScreen onSaveAccount={() => setSavingAccount(true)} />}
            {screen === 'analytics' && session.status === 'signedIn' && <AnalyticsScreen />}
            {screen === 'leaderboard' && session.status === 'signedIn' && <LeaderboardScreen />}
          </>
          )}

      <footer className="footer"><span>No real money. No prizes. Just play.</span><span>American · European</span></footer>

      {setupVariant && <TableSetup initial={{ ...setup, variant: setupVariant }} onStart={startOffline} onClose={() => setSetupVariant(null)} />}
      {onlineMode && (
        <OnlineDialog
          mode={onlineMode}
          busy={onlineBusy}
          error={onlineError}
          initialCode={joinCode ?? undefined}
          onChoose={choice => { void startOnline(choice) }}
          onClose={() => { setOnlineMode(null); setJoinCode(null) }}
        />
      )}
      {signIn && (
        <SignInDialog
          reason={signIn.reason}
          onDone={() => { const { then } = signIn; setSignIn(null); then() }}
          onClose={() => setSignIn(null)}
        />
      )}
      {savingAccount && <SaveAccountDialog onClose={() => setSavingAccount(false)} />}
      {social.invite && !table && (
        <div className="invite-banner" role="alert">
          <p>{t('friends.banner', { name: social.invite.from.username })}</p>
          <button type="button" className="btn-gold small" onClick={() => { const { code } = social.invite!; social.dismissInvite(); void startOnline({ mode: 'join', code }) }}>{t('friends.banner.join')}</button>
          <button type="button" className="btn-ghost small" onClick={social.dismissInvite}>{t('friends.banner.dismiss')}</button>
        </div>
      )}
      {toast && <p className="toast" role="status">{toast}</p>}
    </div>
  )
}
