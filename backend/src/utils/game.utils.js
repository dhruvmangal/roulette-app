import { randomInt } from 'crypto'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, ROOM_STATUS, ROUND_STATUS } from '~/utils/constants/game.constants'

export const LIVE_ROUND_STATUSES = [ROUND_STATUS.BETTING, ROUND_STATUS.BETS_CLOSED, ROUND_STATUS.SPINNING]

export const generateRoomCode = () =>
  Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join('')

/** A bet row as the engine's Bet: { type, pockets | index, amount }. */
export const toEngineBet = (bet) => ({ type: bet.betType, ...bet.selection, amount: bet.amount })

/** An engine Bet split into the row's bet_type and selection columns. */
export const fromEngineBet = ({ type, amount, ...selection }) => ({ betType: type, selection, amount })

export const toBetView = (bet, seat) => ({
  betId: bet.betId,
  roomPlayerId: bet.roomPlayerId,
  seat,
  ...toEngineBet(bet),
  status: bet.status,
  payout: bet.payout ?? null
})

export const toSeatView = (roomPlayer, player) => ({
  roomPlayerId: roomPlayer.roomPlayerId,
  seat: roomPlayer.seat,
  isBot: roomPlayer.isBot,
  playerId: roomPlayer.playerId ?? null,
  name: roomPlayer.isBot ? roomPlayer.botProfile.name : player?.username ?? 'Player',
  botStyle: roomPlayer.isBot ? roomPlayer.botProfile.style : null,
  // Only bots' play-money balances are public; a player's wallet is their own.
  botBalance: roomPlayer.isBot ? roomPlayer.botProfile.balance : null
})

export const toRoomView = (room) => ({
  roomId: room.roomId,
  code: room.code,
  variant: room.variant,
  mode: room.mode,
  status: room.status,
  maxSeats: room.maxSeats,
  totalRounds: room.totalRounds ?? null,
  minBet: room.minBet,
  maxBet: room.maxBet,
  bettingSeconds: room.bettingSeconds,
  hostPlayerId: room.hostPlayerId ?? null
})

/** The pocket is secret until the wheel is spun. */
export const toRoundView = (round) => round && {
  roundId: round.roundId,
  roundNumber: round.roundNumber,
  status: round.status,
  phaseEndsAt: round.phaseEndsAt,
  winningPocket: [ROUND_STATUS.SPINNING, ROUND_STATUS.SETTLED].includes(round.status) ? round.winningPocket : null
}

export const ROOM_ACTIONS = {
  OPEN_ROUND: 'OPEN_ROUND',
  CLOSE_BETTING: 'CLOSE_BETTING',
  SPIN: 'SPIN',
  SETTLE: 'SETTLE',
  END_ROOM: 'END_ROOM',
  // Check again at `at`.
  WAIT: 'WAIT',
  // Nobody is playing: stop running the room until someone joins.
  IDLE: 'IDLE',
  // The room is over.
  STOP: 'STOP'
}

/**
 * What a room's runner should do next. Pure, so the whole round lifecycle can
 * be tested without timers or a database.
 *
 * @param {object} room
 * @param {?object} round the room's latest round
 * @param {number} humansPresent seated players (not bots) connected to the table
 * @param {Date} now
 * @returns {{ action: string, at?: Date }}
 */
export const nextRoomAction = (room, round, humansPresent, now) => {
  const due = round && now >= round.phaseEndsAt
  const wait = () => ({ action: ROOM_ACTIONS.WAIT, at: round.phaseEndsAt })

  switch (round?.status) {
    case ROUND_STATUS.BETTING:
      return due ? { action: ROOM_ACTIONS.CLOSE_BETTING } : wait()
    case ROUND_STATUS.BETS_CLOSED:
      return due ? { action: ROOM_ACTIONS.SPIN } : wait()
    case ROUND_STATUS.SPINNING:
      // A spun wheel is always paid out, even if the room has since ended.
      return due ? { action: ROOM_ACTIONS.SETTLE } : wait()
  }

  if (room.status === ROOM_STATUS.ENDED) return { action: ROOM_ACTIONS.STOP }
  // A private table deals nothing until its host starts the game.
  if (room.status === ROOM_STATUS.WAITING) return { action: ROOM_ACTIONS.IDLE }
  // Let the last result stay on screen before anything else happens.
  if (round && !due) return wait()
  if (room.totalRounds && round && round.roundNumber >= room.totalRounds) return { action: ROOM_ACTIONS.END_ROOM }
  if (humansPresent === 0) return { action: ROOM_ACTIONS.IDLE }
  return { action: ROOM_ACTIONS.OPEN_ROUND }
}
