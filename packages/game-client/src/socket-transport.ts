import {
  CLIENT_EVENTS, ERROR_CODES, SERVER_EVENTS,
  type BetView, type ChatMessage, type Envelope, type RoomState, type RoomView, type RoundView, type SeatView, type ServerEventData,
  type SessionSummaryRow, type WithdrawBetsResult, type PlaceBetsResult
} from '@roulette/contracts'
import { settle, type Bet, type Pocket, type RoundResult, type Seat, type Settlement } from '@roulette/engine'
import type { ActionError, ActionResult, GameTransport, TableState } from './types.ts'

const ACK_TIMEOUT_MS = 8000
const HISTORY_LIMIT = 50

/** The slice of a socket.io-client Socket the transport uses, so tests can stand in a fake. */
export interface SocketLike {
  on (event: string, listener: (...args: any[]) => void): unknown
  off (event: string, listener: (...args: any[]) => void): unknown
  timeout (ms: number): { emit (event: string, payload: unknown, ack: (error: Error | null, response: Envelope<any>) => void): unknown }
}

/** Why joining a table failed. */
export class TableJoinError extends Error {
  readonly reason: ActionError
  constructor (reason: ActionError, message: string) {
    super(message)
    this.name = 'TableJoinError'
    this.reason = reason
  }
}

const OK: ActionResult = { ok: true }
/** An ActionResult for a failed request, without the server's message text. */
const refused = ({ error }: { error: ActionError }): ActionResult => ({ ok: false, error })

const ERROR_REASONS: Record<number, ActionError> = {
  [ERROR_CODES.BettingClosed]: 'BettingClosed',
  [ERROR_CODES.InsufficientBalance]: 'InsufficientFunds',
  [ERROR_CODES.InvalidBet]: 'InvalidBet',
  [ERROR_CODES.BetLimit]: 'BetLimit',
  [ERROR_CODES.BetNotFound]: 'NoBets',
  [ERROR_CODES.NoPreviousBets]: 'NoBets',
  [ERROR_CODES.NotSeated]: 'UnknownPlayer',
  [ERROR_CODES.NotRoomHost]: 'NotAllowed',
  [ERROR_CODES.RoomNotFound]: 'TableClosed',
  [ERROR_CODES.RoomEnded]: 'TableClosed',
  [ERROR_CODES.ChatRateLimited]: 'RateLimited',
  [ERROR_CODES.ChatMessageNotFound]: 'NotAllowed'
}

const CHAT_KEEP = 100

const seatId = (roomPlayerId: number) => String(roomPlayerId)

/** A bet view as the engine's Bet: type, pockets or index, amount. */
const engineBet = ({ type, amount, ...rest }: BetView): Bet => {
  const selection = 'pockets' in rest ? { pockets: rest.pockets } : 'index' in rest ? { index: rest.index } : {}
  return { type, ...selection, amount } as Bet
}

/**
 * Plays a server-run table over the /roulette socket, presenting it as the same TableState the
 * offline LocalTransport produces, so the table UI works unchanged online.
 *
 * The server owns everything: phases run on its timers (controlsPace is false) and it alone
 * decides bets, pockets and payouts. When the wheel is spun the transport settles the round with
 * the shared engine, so the UI can show the result as the ball lands; the server's own result,
 * moments later, confirms it.
 */
export class SocketTransport implements GameTransport {
  readonly controlsPace = false
  readonly roomId: number

  #socket: SocketLike
  #listeners = new Set<(state: TableState) => void>()
  #handlers: Array<[string, (...args: any[]) => void]> = []
  #state!: TableState

  #room!: RoomView
  #me!: number
  #seats = new Map<number, SeatView>()
  #botBalances = new Map<number, number>()
  #wallet = 0
  #round: RoundView | null = null
  #bets = new Map<number, BetView>()
  #history: Pocket[] = []
  #previous: RoundResult | null = null
  /** The server has sent round:result for the round on show. */
  #resultConfirmed = false
  /** The wallet has been updated since then, so it already includes the payout. */
  #walletPaid = false
  /** Server clock minus this device's clock. */
  #clockOffset = 0
  #summary: SessionSummaryRow[] | undefined
  #chat: ChatMessage[] = []
  #closed = false

  private constructor (socket: SocketLike, roomId: number) {
    this.#socket = socket
    this.roomId = roomId
  }

  /** Subscribes to a table the player is seated at (seat them first via REST). */
  static async join (socket: SocketLike, roomId: number): Promise<SocketTransport> {
    const transport = new SocketTransport(socket, roomId)
    const joined = await transport.#request<RoomState>(CLIENT_EVENTS.ROOM_JOIN, { roomId })
    if (!joined.ok) throw new TableJoinError(joined.error, joined.message)
    if (!joined.data.me) throw new TableJoinError('UnknownPlayer', 'Not seated at this table')
    transport.#load(joined.data)
    transport.#listen()
    return transport
  }

  getState = (): TableState => this.#state

  subscribe = (listener: (state: TableState) => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  async selectPlayer (playerId: string): Promise<ActionResult> {
    return playerId === this.#state.me ? OK : { ok: false, error: 'NotAllowed' }
  }

  async placeBet (bet: Bet): Promise<ActionResult> {
    return this.placeBets([bet])
  }

  async placeBets (bets: readonly Bet[]): Promise<ActionResult> {
    if (this.#closed) return { ok: false, error: 'TableClosed' }
    if (!bets.length) return { ok: false, error: 'NoBets' }
    const placed = await this.#request<PlaceBetsResult>(CLIENT_EVENTS.BET_PLACE, {
      roomId: this.roomId,
      bets,
      requestId: globalThis.crypto.randomUUID()
    })
    if (!placed.ok) return refused(placed)
    this.#addBets(placed.data.bets)
    if (placed.data.wallet) this.#wallet = placed.data.wallet.balance
    this.#publish()
    return OK
  }

  async undo (): Promise<ActionResult> {
    const mine = [...this.#bets.values()].filter(bet => bet.roomPlayerId === this.#me)
    const last = mine.reduce<BetView | null>((latest, bet) => !latest || bet.betId > latest.betId ? bet : latest, null)
    if (!last) return { ok: false, error: 'NoBets' }
    return this.#withdraw(CLIENT_EVENTS.BET_REMOVE, { roomId: this.roomId, betId: last.betId })
  }

  async clear (): Promise<ActionResult> {
    return this.#withdraw(CLIENT_EVENTS.BET_CLEAR, { roomId: this.roomId })
  }

  sendChat = (text: string): Promise<ActionResult> => this.#say({ text })

  sendReaction = (reaction: string): Promise<ActionResult> => this.#say({ reaction })

  async #say (body: { text: string } | { reaction: string }): Promise<ActionResult> {
    if (this.#closed) return { ok: false, error: 'TableClosed' }
    const sent = await this.#request<{ message: ChatMessage }>(CLIENT_EVENTS.CHAT_SEND, { roomId: this.roomId, ...body })
    if (!sent.ok) return refused(sent)
    this.#addChat(sent.data.message)
    this.#publish()
    return OK
  }

  setShareBets = async (share: boolean): Promise<ActionResult> => {
    if (this.#closed) return { ok: false, error: 'TableClosed' }
    const set = await this.#request<{ share: boolean }>(CLIENT_EVENTS.CHAT_SHARE_BETS, { roomId: this.roomId, share })
    return set.ok ? OK : refused(set)
  }

  reportChat = async (chatMessageId: number): Promise<ActionResult> => {
    const reported = await this.#request<{ reported: boolean }>(CLIENT_EVENTS.CHAT_REPORT, { roomId: this.roomId, chatMessageId })
    return reported.ok ? OK : refused(reported)
  }

  startGame = async (): Promise<ActionResult> => {
    if (this.#closed) return { ok: false, error: 'TableClosed' }
    const started = await this.#request<{ room: RoomView }>(CLIENT_EVENTS.ROOM_START, { roomId: this.roomId })
    if (!started.ok) return refused(started)
    this.#room = started.data.room
    this.#publish()
    return OK
  }

  /** The server spins the wheel on its own timer. */
  async spin (): Promise<ActionResult> {
    return { ok: false, error: 'NotAllowed' }
  }

  /** The server opens the next round on its own timer. */
  async nextRound (): Promise<ActionResult> {
    return { ok: false, error: 'NotAllowed' }
  }

  /** Gives up the seat (open bets are refunded) and stops listening. The socket stays open. */
  leave (): void {
    if (this.#closed) return
    this.#socket.timeout(ACK_TIMEOUT_MS).emit(CLIENT_EVENTS.ROOM_LEAVE, { roomId: this.roomId }, () => {})
    this.#close()
  }

  /** Stops listening without giving up the seat, e.g. when the app is closing. */
  detach (): void {
    for (const [event, handler] of this.#handlers) this.#socket.off(event, handler)
    this.#handlers = []
  }

  // ── Server events ─────────────────────────────────────────────────

  #listen () {
    const on = <E extends keyof ServerEventData>(event: E, handle: (data: ServerEventData[E]) => void) => {
      const handler = (payload: { data: ServerEventData[E] }) => {
        if (this.#closed) return
        const data = payload?.data as ServerEventData[E] & { roomId?: number }
        if (data && 'roomId' in data && data.roomId !== this.roomId) return
        handle(data)
        this.#publish()
      }
      this.#socket.on(event, handler)
      this.#handlers.push([event, handler])
    }

    on(SERVER_EVENTS.ROUND_PHASE, ({ round, serverTime }) => {
      this.#syncClock(serverTime)
      this.#enterRound(round)
    })
    on(SERVER_EVENTS.BET_ACCEPTED, ({ bets }) => this.#addBets(bets))
    on(SERVER_EVENTS.BET_REMOVED, ({ betIds }) => betIds.forEach(betId => this.#bets.delete(betId)))
    on(SERVER_EVENTS.ROUND_RESULT, ({ roundId, seats }) => {
      if (roundId !== this.#round?.roundId) return
      for (const seat of seats) {
        const bot = this.#botBalances.get(seat.roomPlayerId)
        if (bot !== undefined) this.#botBalances.set(seat.roomPlayerId, bot + seat.returned)
      }
      this.#resultConfirmed = true
    })
    on(SERVER_EVENTS.WALLET_UPDATED, ({ wallet }) => {
      this.#wallet = wallet.balance
      if (this.#resultConfirmed) this.#walletPaid = true
    })
    on(SERVER_EVENTS.PLAYER_JOINED, ({ seat }) => this.#addSeat(seat))
    on(SERVER_EVENTS.PLAYER_LEFT, ({ seat }) => {
      if (seat.roomPlayerId === this.#me) return this.#close()
      this.#seats.delete(seat.roomPlayerId)
    })
    on(SERVER_EVENTS.CHAT_MESSAGE, ({ message }) => this.#addChat(message))
    on(SERVER_EVENTS.ROOM_UPDATED, ({ room }) => { this.#room = room })
    on(SERVER_EVENTS.ROOM_ENDED, ({ summary }) => {
      this.#summary = summary
      this.#close()
    })

    // After a dropped connection, rebuild everything from the server: events may have been missed.
    const resync = () => {
      this.#request<RoomState>(CLIENT_EVENTS.ROOM_JOIN, { roomId: this.roomId }).then(joined => {
        if (this.#closed) return
        if (joined.ok && joined.data.me) this.#load(joined.data)
        else this.#close()
      })
    }
    this.#socket.on('connect', resync)
    this.#handlers.push(['connect', resync])
  }

  #load (state: RoomState) {
    this.#syncClock(state.serverTime)
    this.#room = state.room
    this.#me = state.me!.roomPlayerId
    this.#seats.clear()
    this.#botBalances.clear()
    state.seats.forEach(seat => this.#addSeat(seat))
    this.#wallet = state.wallet?.balance ?? 0
    this.#history = [...state.history]
    this.#chat = []
    for (const message of state.chat ?? []) this.#addChat(message)
    this.#bets.clear()
    this.#round = null
    this.#enterRound(state.round)
    for (const bet of state.bets) this.#bets.set(bet.betId, bet)
    // Joining mid-result: the server has settled, and the wallet already includes the payout.
    this.#resultConfirmed = this.#walletPaid = state.round?.status === 'SETTLED'
    if (state.room.status === 'ENDED') this.#closed = true
    this.#publish()
  }

  #enterRound (round: RoundView | null) {
    const current = this.#round
    if (round && current && round.roundId !== current.roundId) {
      // A new round: the last result becomes `previous` and the felt is cleared.
      if (current.winningPocket) this.#previous = this.#roundResult(current)
      this.#bets.clear()
    }
    const alreadySpinning = current?.roundId === round?.roundId && current?.status === 'SPINNING'
    if (round?.status === 'SPINNING' && round.winningPocket && !alreadySpinning) {
      // The pocket joins the history the moment the wheel is spun, as the engine records it.
      this.#history = [round.winningPocket, ...this.#history].slice(0, HISTORY_LIMIT)
      this.#resultConfirmed = this.#walletPaid = false
    }
    this.#round = round
  }

  #addSeat (seat: SeatView) {
    this.#seats.set(seat.roomPlayerId, seat)
    if (seat.isBot) this.#botBalances.set(seat.roomPlayerId, seat.botBalance ?? 0)
  }

  /** Adds a message once (the sender also gets it back as an event), oldest first. */
  #addChat (message: ChatMessage) {
    if (this.#chat.some(known => known.chatMessageId === message.chatMessageId)) return
    this.#chat = [...this.#chat, message].sort((a, b) => a.chatMessageId - b.chatMessageId).slice(-CHAT_KEEP)
  }

  #addBets (bets: BetView[]) {
    for (const bet of bets) {
      if (this.#bets.has(bet.betId)) continue
      this.#bets.set(bet.betId, bet)
      const bot = this.#botBalances.get(bet.roomPlayerId)
      if (bot !== undefined) this.#botBalances.set(bet.roomPlayerId, bot - bet.amount)
    }
  }

  // ── Building the snapshot ─────────────────────────────────────────

  #betsBySeat (): Map<number, Bet[]> {
    const bySeat = new Map<number, Bet[]>()
    for (const bet of [...this.#bets.values()].sort((a, b) => a.betId - b.betId)) {
      if (bet.status === 'REFUNDED') continue
      bySeat.set(bet.roomPlayerId, [...(bySeat.get(bet.roomPlayerId) ?? []), engineBet(bet)])
    }
    return bySeat
  }

  /** The round settled by the shared engine, for every seat with or without bets. */
  #roundResult (round: RoundView): RoundResult | null {
    if (!round.winningPocket) return null
    const bySeat = this.#betsBySeat()
    const settlements: Record<string, Settlement> = {}
    for (const roomPlayerId of new Set([...this.#seats.keys(), ...bySeat.keys()])) {
      settlements[seatId(roomPlayerId)] = settle(this.#room.variant, bySeat.get(roomPlayerId) ?? [], round.winningPocket)
    }
    return { round: round.roundNumber, pocket: round.winningPocket, settlements }
  }

  #publish () {
    const round = this.#round
    const live = round && (round.status === 'SPINNING' || round.status === 'SETTLED')
    const result = live ? this.#roundResult(round) : null
    const betting = !round || round.status === 'BETTING' || round.status === 'CANCELLED'
    const bySeat = this.#betsBySeat()
    const payout = (roomPlayerId: number) => result?.settlements[seatId(roomPlayerId)]?.totalPayout ?? 0

    const seats: Seat[] = [...this.#seats.values()].sort((a, b) => a.seat - b.seat).map(view => {
      let balance = Number.NaN
      if (view.roomPlayerId === this.#me) balance = this.#wallet + (this.#walletPaid ? 0 : payout(view.roomPlayerId))
      else if (view.isBot) balance = (this.#botBalances.get(view.roomPlayerId) ?? 0) + (this.#resultConfirmed ? 0 : payout(view.roomPlayerId))
      return {
        playerId: seatId(view.roomPlayerId),
        name: view.name,
        seat: view.seat,
        botStyle: view.botStyle,
        balance,
        bets: bySeat.get(view.roomPlayerId) ?? []
      }
    })

    this.#state = {
      variant: this.#room.variant,
      round: round?.roundNumber ?? 1,
      phase: betting ? 'BETTING' : 'RESULT',
      seats,
      result,
      previous: this.#previous,
      history: this.#history,
      roomCode: this.#room.code,
      phaseEndsAt: round && round.status !== 'CANCELLED' ? Date.parse(round.phaseEndsAt) - this.#clockOffset : null,
      me: seatId(this.#me),
      localPlayers: [seatId(this.#me)],
      closed: this.#closed,
      chat: this.#chat,
      ...(this.#room.mode === 'PRIVATE' && { lobby: this.#lobby() }),
      ...(this.#summary && { summary: this.#summary })
    }
    for (const listener of this.#listeners) listener(this.#state)
  }

  #lobby (): NonNullable<TableState['lobby']> {
    const host = [...this.#seats.values()].find(seat => seat.playerId !== null && seat.playerId === this.#room.hostPlayerId)
    return { waiting: this.#room.status === 'WAITING', hostName: host?.name ?? null, isHost: host?.roomPlayerId === this.#me }
  }

  // ── Requests ──────────────────────────────────────────────────────

  async #withdraw (event: string, payload: object): Promise<ActionResult> {
    if (this.#closed) return { ok: false, error: 'TableClosed' }
    const removed = await this.#request<WithdrawBetsResult>(event, payload)
    if (!removed.ok) return refused(removed)
    removed.data.betIds.forEach(betId => this.#bets.delete(betId))
    this.#wallet = removed.data.wallet.balance
    this.#publish()
    return OK
  }

  #request<T> (event: string, payload: object): Promise<{ ok: true, data: T } | { ok: false, error: ActionError, message: string }> {
    return new Promise(resolve => {
      this.#socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (error, response) => {
        if (error) return resolve({ ok: false, error: 'NetworkError', message: 'The server did not answer' })
        const failure = response?.errors?.[0]
        if (!failure) return resolve({ ok: true, data: response.data as T })
        resolve({ ok: false, error: ERROR_REASONS[failure.errorCode ?? -1] ?? 'NotAllowed', message: failure.details || failure.description })
      })
    })
  }

  #syncClock (serverTime: string) {
    const server = Date.parse(serverTime)
    if (Number.isFinite(server)) this.#clockOffset = server - Date.now()
  }

  #close () {
    this.#closed = true
    this.detach()
    this.#publish()
    this.#listeners.clear()
  }
}
