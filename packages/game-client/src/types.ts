import type { ChatMessage, SessionSummaryRow } from '@roulette/contracts'
import type { Bet, Table, TableError } from '@roulette/engine'

export type { RoundPhase, RoundResult, Seat } from '@roulette/engine'

/**
 * What the table UI renders: the engine's table plus what this device knows about it.
 * An immutable snapshot, so it can feed useSyncExternalStore.
 *
 * Seat balances include the round's payouts once the phase is RESULT. Online, other
 * real players' wallets are private, so their balance is NaN.
 */
export interface TableState extends Table {
  roomCode: string | null
  /** Epoch ms when the phase ends on a timed table, or null when a player sets the pace. */
  phaseEndsAt: number | null
  /** The player this device is acting as. */
  me: string
  /** Players who share this device (pass-and-play). Online this is just `me`. */
  localPlayers: string[]
  closed: boolean
  /** How everyone did, once the table has closed (online tables). */
  summary?: SessionSummaryRow[]
  /** Table chat, oldest first (online tables only). */
  chat?: ChatMessage[]
  /** Private tables before the game starts: who hosts, and whether that is this player. */
  lobby?: { waiting: boolean, hostName: string | null, isHost: boolean }
}

export type ActionError = TableError | 'TableClosed' | 'BetLimit' | 'NetworkError' | 'RateLimited'

export type ActionResult = { ok: true } | { ok: false, error: ActionError }

/**
 * Everything the table UI does goes through this interface. LocalTransport runs the round in the
 * browser; a socket transport will relay the same actions to the server.
 */
export interface GameTransport {
  /** True when this player starts spins and rounds; false on tables the server runs on timers. */
  readonly controlsPace: boolean
  getState (): TableState
  /** Hands the device to another local player. */
  selectPlayer (playerId: string): Promise<ActionResult>
  subscribe (listener: (state: TableState) => void): () => void
  placeBet (bet: Bet): Promise<ActionResult>
  /** Places all the bets or none of them, as repeat and double need. */
  placeBets (bets: readonly Bet[]): Promise<ActionResult>
  undo (): Promise<ActionResult>
  clear (): Promise<ActionResult>
  spin (): Promise<ActionResult>
  nextRound (): Promise<ActionResult>
  /** Leaves the table. Open bets are refunded if betting is still open. */
  leave (): void
  /** Table chat; only online tables have it. */
  sendChat?: (text: string) => Promise<ActionResult>
  /** A quick reaction, by id (see REACTIONS in @roulette/contracts). */
  sendReaction?: (reaction: string) => Promise<ActionResult>
  /** Whether the table's chat may say what this player bet and won. */
  setShareBets?: (share: boolean) => Promise<ActionResult>
  /** Flags a chat message for the moderators. */
  reportChat?: (chatMessageId: number) => Promise<ActionResult>
  /** Private tables: the host starts the game for everyone waiting. */
  startGame?: () => Promise<ActionResult>
}
