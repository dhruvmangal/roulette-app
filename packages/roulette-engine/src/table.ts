import { settle, spin, validateBet } from './bets.ts'
import { BOT_STRATEGIES, type BotStyle } from './bots.ts'
import type { Bet, BetErrorCode, Pocket, RandomInt, Settlement, VariantName } from './types.ts'

/**
 * One roulette table's rounds as pure functions over immutable snapshots. The browser wraps this
 * with local timers (offline) and the server wraps it with sockets, timers and the wallet
 * (online), so both play by exactly the same rules.
 */

export const MAX_SEATS = 8
const HISTORY_LIMIT = 50

/**
 * BETTING: bets are open.
 * RESULT: the winning pocket is known and every seat is already settled, so clients can animate
 * the wheel to `result.pocket` and hide the payout until the ball lands.
 */
export type RoundPhase = 'BETTING' | 'RESULT'

export interface Seat {
  playerId: string
  name: string
  /** 1..8 */
  seat: number
  /** Set for computer players. */
  botStyle: BotStyle | null
  balance: number
  /** This round's bets in the order they were placed. */
  bets: Bet[]
}

export interface RoundResult {
  round: number
  pocket: Pocket
  /** Keyed by player id. Seat balances already include these payouts. */
  settlements: Record<string, Settlement>
}

export interface Table {
  variant: VariantName
  round: number
  phase: RoundPhase
  seats: Seat[]
  /** Set only while the phase is RESULT. */
  result: RoundResult | null
  /** The round before this one, kept for strategies like martingale. */
  previous: RoundResult | null
  /** Winning pockets, newest first. */
  history: Pocket[]
}

export interface SeatInput {
  playerId: string
  name: string
  balance: number
  botStyle?: BotStyle | null
}

export type TableError = BetErrorCode | 'BettingClosed' | 'InsufficientFunds' | 'NoBets' | 'NotAllowed' | 'UnknownPlayer' | 'TableFull' | 'AlreadySeated'

export type TableUpdate = { ok: true, table: Table } | { ok: false, error: TableError }

const updated = (table: Table): TableUpdate => ({ ok: true, table })
const refused = (error: TableError): TableUpdate => ({ ok: false, error })

const staked = (bets: readonly Bet[]) => bets.reduce((sum, bet) => sum + bet.amount, 0)

export function findSeat (table: Table, playerId: string): Seat | undefined {
  return table.seats.find(seat => seat.playerId === playerId)
}

function withSeat (table: Table, playerId: string, change: (seat: Seat) => Seat): Table {
  return { ...table, seats: table.seats.map(seat => seat.playerId === playerId ? change(seat) : seat) }
}

/** Opens a table at round 1 with bets open. Seats are numbered in the order given. */
export function createTable (variant: VariantName, players: readonly SeatInput[] = []): Table {
  let table: Table = { variant, round: 1, phase: 'BETTING', seats: [], result: null, previous: null, history: [] }
  for (const player of players) {
    const next = joinTable(table, player)
    if (!next.ok) throw new Error(`Cannot seat ${player.playerId}: ${next.error}`)
    table = next.table
  }
  return table
}

/** Seats a player in the lowest free seat. They can bet straight away if betting is open. */
export function joinTable (table: Table, player: SeatInput): TableUpdate {
  if (findSeat(table, player.playerId)) return refused('AlreadySeated')
  if (table.seats.length >= MAX_SEATS) return refused('TableFull')
  const taken = new Set(table.seats.map(seat => seat.seat))
  let seat = 1
  while (taken.has(seat)) seat++
  const joined: Seat = { playerId: player.playerId, name: player.name, seat, botStyle: player.botStyle ?? null, balance: player.balance, bets: [] }
  return updated({ ...table, seats: [...table.seats, joined].sort((a, b) => a.seat - b.seat) })
}

/** Removes a player. Open bets are refunded; after a spin their payout is already in the balance. */
export function leaveTable (table: Table, playerId: string): TableUpdate {
  if (!findSeat(table, playerId)) return refused('UnknownPlayer')
  const refunded = table.phase === 'BETTING' ? refundBets(table, playerId) : table
  return updated({ ...refunded, seats: refunded.seats.filter(seat => seat.playerId !== playerId) })
}

/** Places all the bets or none: each must be legal and together they must fit the balance. */
export function placeBets (table: Table, playerId: string, bets: readonly Bet[]): TableUpdate {
  if (table.phase !== 'BETTING') return refused('BettingClosed')
  const seat = findSeat(table, playerId)
  if (!seat) return refused('UnknownPlayer')
  if (!bets.length) return refused('NoBets')
  const accepted: Bet[] = []
  for (const input of bets) {
    const result = validateBet(table.variant, input)
    if (!result.ok) return refused(result.error)
    accepted.push(result.bet)
  }
  const total = staked(accepted)
  if (total > seat.balance) return refused('InsufficientFunds')
  return updated(withSeat(table, playerId, current => ({ ...current, balance: current.balance - total, bets: [...current.bets, ...accepted] })))
}

/** Takes back the player's most recent bet. */
export function undoBet (table: Table, playerId: string): TableUpdate {
  if (table.phase !== 'BETTING') return refused('BettingClosed')
  const seat = findSeat(table, playerId)
  if (!seat) return refused('UnknownPlayer')
  const last = seat.bets[seat.bets.length - 1]
  if (!last) return refused('NoBets')
  return updated(withSeat(table, playerId, current => ({ ...current, balance: current.balance + last.amount, bets: current.bets.slice(0, -1) })))
}

/** Takes back all of the player's bets this round. */
export function clearBets (table: Table, playerId: string): TableUpdate {
  if (table.phase !== 'BETTING') return refused('BettingClosed')
  const seat = findSeat(table, playerId)
  if (!seat) return refused('UnknownPlayer')
  if (!seat.bets.length) return refused('NoBets')
  return updated(refundBets(table, playerId))
}

/** Every seat's open bets back into their balances, e.g. when a round is abandoned. */
export function refundAll (table: Table): Table {
  return table.seats.reduce((current, seat) => refundBets(current, seat.playerId), table)
}

function refundBets (table: Table, playerId: string): Table {
  return withSeat(table, playerId, seat => seat.bets.length ? { ...seat, balance: seat.balance + staked(seat.bets), bets: [] } : seat)
}

/** Closes betting, picks the winning pocket and settles every seat. */
export function spinTable (table: Table, randomInt: RandomInt): TableUpdate {
  if (table.phase !== 'BETTING') return refused('BettingClosed')
  const pocket = spin(table.variant, randomInt)
  const settlements: Record<string, Settlement> = {}
  for (const seat of table.seats) settlements[seat.playerId] = settle(table.variant, seat.bets, pocket)
  return updated({
    ...table,
    phase: 'RESULT',
    seats: table.seats.map(seat => ({ ...seat, balance: seat.balance + settlements[seat.playerId].totalPayout })),
    result: { round: table.round, pocket, settlements },
    history: [pocket, ...table.history].slice(0, HISTORY_LIMIT)
  })
}

/** Clears the felt and opens betting for the next round. */
export function nextRound (table: Table): TableUpdate {
  if (table.phase !== 'RESULT') return refused('NotAllowed')
  return updated({
    ...table,
    round: table.round + 1,
    phase: 'BETTING',
    seats: table.seats.map(seat => ({ ...seat, bets: [] })),
    result: null,
    previous: table.result
  })
}

/**
 * Lets a computer player choose and place its bets for this round. A bot that cannot afford
 * anything sits the round out, so the table comes back unchanged.
 */
export function playBot (table: Table, playerId: string, randomInt: RandomInt): TableUpdate {
  if (table.phase !== 'BETTING') return refused('BettingClosed')
  const seat = findSeat(table, playerId)
  if (!seat) return refused('UnknownPlayer')
  if (!seat.botStyle) return refused('NotAllowed')
  const bets = BOT_STRATEGIES[seat.botStyle]({
    variant: table.variant,
    balance: seat.balance,
    history: table.history,
    last: table.previous?.settlements[playerId] ?? null,
    randomInt
  })
  if (!bets.length) return updated(table)
  const placed = placeBets(table, playerId, bets)
  return placed.ok ? placed : updated(table)
}
