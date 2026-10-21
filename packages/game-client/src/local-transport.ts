import {
  MAX_SEATS, clearBets, createTable, findSeat, nextRound, placeBets, playBot, refundAll, spinTable, undoBet,
  type Bet, type BotStyle, type RandomInt, type Seat, type Table, type TableUpdate, type VariantName
} from '@roulette/engine'
import type { ActionResult, GameTransport, TableState } from './types.ts'

/** Bots place their bets this long after betting opens, so their chips arrive one by one. */
const BOT_DELAY_MIN_MS = 600
const BOT_DELAY_SPREAD_MS = 2400

export interface LocalPlayer {
  id: string
  name: string
  balance: number
  /** Makes this seat a computer player. */
  bot?: BotStyle
}

/** Runs `task` after `delayMs` and returns a function that cancels it. */
export type Schedule = (task: () => void, delayMs: number) => () => void

export interface LocalTransportOptions {
  variant: VariantName
  /** Seats in order. The first player who is not a bot holds the device first. */
  players: LocalPlayer[]
  /** On the client pass a CSPRNG-backed function; tests pass a fixed sequence. */
  randomInt: RandomInt
  roomCode?: string | null
  schedule?: Schedule
}

const OK: ActionResult = { ok: true }

const defaultSchedule: Schedule = (task, delayMs) => {
  const id = setTimeout(task, delayMs)
  return () => clearTimeout(id)
}

export function seatOf (state: TableState, playerId = state.me): Seat {
  const seat = findSeat(state, playerId)
  if (!seat) throw new Error(`Player ${playerId} has no seat`)
  return seat
}

/**
 * Runs a table entirely in the browser on the engine's round logic. Local players set the pace;
 * bots bet on timers.
 */
export class LocalTransport implements GameTransport {
  readonly controlsPace = true
  #state: TableState
  #listeners = new Set<(state: TableState) => void>()
  #randomInt: RandomInt
  #schedule: Schedule
  /** Bots that have not bet yet this round, with the cancel for their timer. */
  #pendingBots = new Map<string, () => void>()

  constructor (options: LocalTransportOptions) {
    const { variant, players, randomInt, roomCode = null, schedule = defaultSchedule } = options
    if (players.length > MAX_SEATS) throw new Error(`A table has at most ${MAX_SEATS} seats`)
    const humans = players.filter(player => !player.bot).map(player => player.id)
    if (!humans.length) throw new Error('A local table needs at least one player who is not a bot')
    this.#randomInt = randomInt
    this.#schedule = schedule
    const table = createTable(variant, players.map(({ id, name, balance, bot }) => ({ playerId: id, name, balance, botStyle: bot })))
    this.#state = { ...table, roomCode, phaseEndsAt: null, me: humans[0], localPlayers: humans, closed: false }
    this.#scheduleBots()
  }

  getState = (): TableState => this.#state

  subscribe = (listener: (state: TableState) => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  async selectPlayer (playerId: string): Promise<ActionResult> {
    if (this.#state.closed) return { ok: false, error: 'TableClosed' }
    if (!this.#state.localPlayers.includes(playerId)) return { ok: false, error: 'NotAllowed' }
    if (playerId !== this.#state.me) this.#set({ ...this.#state, me: playerId })
    return OK
  }

  async placeBet (bet: Bet): Promise<ActionResult> {
    return this.placeBets([bet])
  }

  async placeBets (bets: readonly Bet[]): Promise<ActionResult> {
    return this.#apply(table => placeBets(table, this.#state.me, bets))
  }

  async undo (): Promise<ActionResult> {
    return this.#apply(table => undoBet(table, this.#state.me))
  }

  async clear (): Promise<ActionResult> {
    return this.#apply(table => clearBets(table, this.#state.me))
  }

  async spin (): Promise<ActionResult> {
    if (this.#state.phase === 'BETTING') {
      // Bots still thinking when the wheel is spun get their bets in first.
      for (const playerId of [...this.#pendingBots.keys()]) this.#botBet(playerId)
    }
    return this.#apply(table => spinTable(table, this.#randomInt))
  }

  async nextRound (): Promise<ActionResult> {
    const result = this.#apply(nextRound)
    if (result.ok) this.#scheduleBots()
    return result
  }

  leave (): void {
    if (this.#state.closed) return
    this.#cancelBots()
    const table = this.#state.phase === 'BETTING' ? refundAll(this.#state) : this.#state
    this.#set({ ...this.#state, ...table, closed: true })
    this.#listeners.clear()
  }

  /** Runs one engine step against the current table and publishes the new snapshot. */
  #apply (step: (table: Table) => TableUpdate): ActionResult {
    if (this.#state.closed) return { ok: false, error: 'TableClosed' }
    const update = step(this.#state)
    if (!update.ok) return update
    this.#set({ ...this.#state, ...update.table })
    return OK
  }

  #scheduleBots () {
    for (const seat of this.#state.seats) {
      if (!seat.botStyle) continue
      const playerId = seat.playerId
      const delay = BOT_DELAY_MIN_MS + this.#randomInt(BOT_DELAY_SPREAD_MS)
      this.#pendingBots.set(playerId, this.#schedule(() => this.#botBet(playerId), delay))
    }
  }

  #cancelBots () {
    for (const cancel of this.#pendingBots.values()) cancel()
    this.#pendingBots.clear()
  }

  #botBet (playerId: string) {
    this.#pendingBots.get(playerId)?.()
    this.#pendingBots.delete(playerId)
    this.#apply(table => playBot(table, playerId, this.#randomInt))
  }

  #set (next: TableState) {
    this.#state = next
    for (const listener of this.#listeners) listener(next)
  }
}
