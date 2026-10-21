import { ROOM_ACTIONS, fromEngineBet, generateRoomCode, nextRoomAction, toEngineBet, toRoundView } from '~/utils/game.utils'

const now = new Date('2026-10-19T12:00:00Z')
const later = new Date(now.getTime() + 5000)
const earlier = new Date(now.getTime() - 1)

const room = (overrides = {}) => ({ status: 'OPEN', totalRounds: null, ...overrides })
const round = (status, phaseEndsAt, roundNumber = 1) => ({ status, phaseEndsAt, roundNumber })

describe('nextRoomAction', () => {
  it('opens the first round once someone is seated', () => {
    expect(nextRoomAction(room(), null, 1, now)).toEqual({ action: ROOM_ACTIONS.OPEN_ROUND })
    expect(nextRoomAction(room(), null, 0, now)).toEqual({ action: ROOM_ACTIONS.IDLE })
  })

  it('deals nothing at a private table until its host starts it', () => {
    expect(nextRoomAction(room({ status: 'WAITING' }), null, 3, now)).toEqual({ action: ROOM_ACTIONS.IDLE })
  })

  it('waits out each phase, then moves to the next', () => {
    expect(nextRoomAction(room(), round('BETTING', later), 1, now)).toEqual({ action: ROOM_ACTIONS.WAIT, at: later })
    expect(nextRoomAction(room(), round('BETTING', earlier), 1, now)).toEqual({ action: ROOM_ACTIONS.CLOSE_BETTING })
    expect(nextRoomAction(room(), round('BETS_CLOSED', earlier), 1, now)).toEqual({ action: ROOM_ACTIONS.SPIN })
    expect(nextRoomAction(room(), round('SPINNING', later), 1, now)).toEqual({ action: ROOM_ACTIONS.WAIT, at: later })
    expect(nextRoomAction(room(), round('SPINNING', earlier), 1, now)).toEqual({ action: ROOM_ACTIONS.SETTLE })
  })

  it('shows the result before the next round', () => {
    expect(nextRoomAction(room(), round('SETTLED', later), 1, now)).toEqual({ action: ROOM_ACTIONS.WAIT, at: later })
    expect(nextRoomAction(room(), round('SETTLED', earlier), 1, now)).toEqual({ action: ROOM_ACTIONS.OPEN_ROUND })
  })

  it('keeps going with bets on the table even if every player left', () => {
    expect(nextRoomAction(room(), round('BETTING', earlier), 0, now)).toEqual({ action: ROOM_ACTIONS.CLOSE_BETTING })
    expect(nextRoomAction(room(), round('SETTLED', earlier), 0, now)).toEqual({ action: ROOM_ACTIONS.IDLE })
  })

  it('ends the room after its last round', () => {
    expect(nextRoomAction(room({ totalRounds: 3 }), round('SETTLED', earlier, 3), 2, now)).toEqual({ action: ROOM_ACTIONS.END_ROOM })
    expect(nextRoomAction(room({ totalRounds: 3 }), round('SETTLED', earlier, 2), 2, now)).toEqual({ action: ROOM_ACTIONS.OPEN_ROUND })
  })

  it('still pays out a spinning wheel in a room that has ended, then stops', () => {
    const ended = room({ status: 'ENDED' })
    expect(nextRoomAction(ended, round('SPINNING', earlier), 0, now)).toEqual({ action: ROOM_ACTIONS.SETTLE })
    expect(nextRoomAction(ended, round('SETTLED', later), 0, now)).toEqual({ action: ROOM_ACTIONS.STOP })
    expect(nextRoomAction(ended, round('CANCELLED', earlier), 0, now)).toEqual({ action: ROOM_ACTIONS.STOP })
  })
})

describe('bet rows', () => {
  it('round-trip between engine bets and bet_type + selection columns', () => {
    for (const bet of [{ type: 'SPLIT', pockets: ['1', '2'], amount: 5 }, { type: 'DOZEN', index: 2, amount: 10 }, { type: 'RED', amount: 1 }]) {
      const row = fromEngineBet(bet)
      expect(toEngineBet(row)).toEqual(bet)
    }
  })
})

describe('round view', () => {
  it('keeps the winning pocket secret until the wheel spins', () => {
    const base = { roundId: 1, roundNumber: 1, phaseEndsAt: now, winningPocket: '17' }
    expect(toRoundView({ ...base, status: 'BETS_CLOSED' }).winningPocket).toBeNull()
    expect(toRoundView({ ...base, status: 'SPINNING' }).winningPocket).toBe('17')
  })
})

describe('room codes', () => {
  it('are six unambiguous characters', () => {
    for (let i = 0; i < 200; i++) expect(generateRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
  })
})
