import type { ApiClient } from '@roulette/api-client'
import type { ArcadePlay, ArcadeRound, CrashRound, HorsesRound, PlinkoRound, WheelRound } from '@roulette/contracts'
import {
  ARCADE_LIMITS, CRASH_SLOTS, HORSES, arcadePayout, crashPoint, horsePayout, horseRace, plinkoDrop, resolveCrashBets, wheelSpin,
  type ArcadeGame, type ArcadeRisk, type CrashGame, type HorseBet, type RandomInt
} from '@roulette/engine'

export interface CrashBetInput {
  stake: number
  /** Cash out by itself at this multiplier (1.01 to 1000). */
  autoCashout?: number | null
}

/** A flight that ended while the page was away, or the one still in the air. */
export interface ActiveCrash {
  round: CrashRound | null
  landed: CrashRound | null
  /** The balance, when the server settled something just now. */
  balance: number | null
}

/**
 * The arcade as a screen sees it, wherever the chips and the draws live: on the server for a
 * signed-in player, on the device for practice chips. Every call that stakes chips resolves with
 * the balance afterwards, so the screen can show it when it likes (after the animation).
 */
export interface ArcadeBackend {
  readonly kind: 'online' | 'practice'
  plinko (input: { stake: number, rows: number, risk: ArcadeRisk }): Promise<ArcadePlay<PlinkoRound>>
  wheel (input: { stake: number, risk: ArcadeRisk }): Promise<ArcadePlay<WheelRound>>
  horses (bets: HorseBet[]): Promise<ArcadePlay<HorsesRound>>
  startCrash (game: CrashGame, bets: CrashBetInput[]): Promise<ArcadePlay<CrashRound>>
  /** Cashes a bet out now. The answer says how it ended: cashed at a multiplier, or crashed first. */
  cashOut (round: CrashRound, slot: number): Promise<ArcadePlay<CrashRound>>
  activeCrash (game: CrashGame): Promise<ActiveCrash>
  history (game?: ArcadeGame): Promise<ArcadeRound[]>
}

const newRequestId = (): string => globalThis.crypto.randomUUID()

/** The server's arcade, for a signed-in player. */
export function remoteArcade (api: ApiClient): ArcadeBackend {
  return {
    kind: 'online',
    plinko: async input => { const { round, wallet } = await api.playPlinko({ ...input, requestId: newRequestId() }); return { round, balance: wallet.balance } },
    wheel: async input => { const { round, wallet } = await api.playWheel({ ...input, requestId: newRequestId() }); return { round, balance: wallet.balance } },
    horses: async bets => { const { round, wallet } = await api.playHorses({ bets, requestId: newRequestId() }); return { round, balance: wallet.balance } },
    startCrash: async (game, bets) => { const { round, wallet } = await api.startCrash({ game, bets, requestId: newRequestId() }); return { round, balance: wallet.balance } },
    cashOut: async (round, slot) => { const { round: after, wallet } = await api.cashOutCrash(round.arcadeRoundId, slot); return { round: after, balance: wallet.balance } },
    activeCrash: async game => { const { round, landed, wallet } = await api.activeCrash(game); return { round, landed, balance: wallet?.balance ?? null } },
    history: async game => (await api.arcadeHistory({ game, limit: 30 })).rounds
  }
}

/** Where practice chips live: the wallet the offline tables use. */
export interface PracticeWallet {
  getBalance (): number | null
  set (balance: number): void
}

interface Flight {
  round: CrashRound
  crashPoint: number
  startedMs: number
}

/**
 * The arcade on the device, for practice chips: the same maths as the server, nothing stored
 * but the balance. A flight lives in memory, so leaving the page forfeits it.
 */
export function practiceArcade ({ wallet, randomInt, now = Date.now }: { wallet: PracticeWallet, randomInt: RandomInt, now?: () => number }): ArcadeBackend {
  let nextId = 1
  const flights = new Map<CrashGame, Flight>()
  const recent: ArcadeRound[] = []

  const balance = () => wallet.getBalance() ?? 0
  const base = (stake: number, payout: number) => {
    const at = new Date(now()).toISOString()
    return { arcadeRoundId: nextId++, status: 'SETTLED' as const, stake, payout, startedAt: at, settledAt: at }
  }
  const checkStake = (stake: number) => {
    if (!Number.isInteger(stake) || stake < ARCADE_LIMITS.minBet || stake > ARCADE_LIMITS.maxBet) throw new Error(`A bet is ${ARCADE_LIMITS.minBet} to ${ARCADE_LIMITS.maxBet} chips.`)
  }
  const pay = (stake: number, payout: number) => {
    if (stake > balance()) throw new Error('Not enough practice chips.')
    wallet.set(balance() - stake + payout)
    return balance()
  }
  const keep = <R extends ArcadeRound>(round: R): R => {
    recent.unshift(round)
    recent.length = Math.min(recent.length, 30)
    return round
  }

  /** Brings a flight up to date with the clock and pays what it owes. */
  const settle = (flight: Flight, cashNowSlot: number | null = null): CrashRound => {
    const { bets, settled, over } = resolveCrashBets({ crashPoint: flight.crashPoint, bets: flight.round.outcome.bets }, now() - flight.startedMs, cashNowSlot)
    if (settled.length) {
      wallet.set(balance() + settled.reduce((sum, bet) => sum + (bet.payout ?? 0), 0))
      const payout = bets.reduce((sum, bet) => sum + (bet.payout ?? 0), 0)
      flight.round = {
        ...flight.round,
        outcome: { ...flight.round.outcome, bets, ...(over && { crashPoint: flight.crashPoint }) },
        ...(over && { status: 'SETTLED' as const, payout, settledAt: new Date(now()).toISOString() })
      }
    }
    return flight.round
  }
  /** What the screen may see of a flight in the air: no crash point. */
  const inTheAir = (flight: Flight): CrashRound => ({ ...flight.round, elapsedMs: now() - flight.startedMs })

  return {
    kind: 'practice',

    async plinko ({ stake, rows, risk }) {
      checkStake(stake)
      const drop = plinkoDrop(rows, risk, randomInt)
      const payout = arcadePayout(stake, drop.multiplier)
      const after = pay(stake, payout)
      return { round: keep({ ...base(stake, payout), game: 'PLINKO', outcome: { rows, risk, ...drop } }), balance: after }
    },

    async wheel ({ stake, risk }) {
      checkStake(stake)
      const spin = wheelSpin(risk, randomInt)
      const payout = arcadePayout(stake, spin.multiplier)
      const after = pay(stake, payout)
      return { round: keep({ ...base(stake, payout), game: 'WHEEL', outcome: { risk, ...spin } }), balance: after }
    },

    async horses (bets) {
      if (!bets.length || new Set(bets.map(bet => bet.horse)).size !== bets.length || bets.some(bet => !Number.isInteger(bet.horse) || bet.horse < 0 || bet.horse >= HORSES.length)) {
        throw new Error('Back each horse once.')
      }
      bets.forEach(bet => checkStake(bet.stake))
      const race = horseRace(randomInt)
      const stake = bets.reduce((sum, bet) => sum + bet.stake, 0)
      const payout = horsePayout(bets, race)
      const after = pay(stake, payout)
      return { round: keep({ ...base(stake, payout), game: 'HORSES', outcome: { bets, ...race, winner: race.order[0], odds: HORSES.map(horse => horse.odds) } }), balance: after }
    },

    async startCrash (game, bets) {
      if (bets.length < 1 || bets.length > CRASH_SLOTS[game]) throw new Error('Aviator takes one or two bets.')
      for (const bet of bets) {
        checkStake(bet.stake)
        const auto = bet.autoCashout
        if (auto != null && (!(auto >= 1.01 && auto <= 1000) || Math.round(auto * 100) / 100 !== auto)) throw new Error('Auto cash-out is 1.01 to 1000.')
      }
      const open = flights.get(game)
      if (open) {
        const round = settle(open)
        if (round.status === 'ACTIVE') throw new Error('A flight is still in the air. Cash out or wait for it to land.')
        flights.delete(game)
        keep(round)
      }
      const stake = bets.reduce((sum, bet) => sum + bet.stake, 0)
      const after = pay(stake, 0)
      const flight: Flight = {
        crashPoint: crashPoint(randomInt),
        startedMs: now(),
        round: {
          ...base(stake, 0),
          status: 'ACTIVE',
          game,
          settledAt: null,
          outcome: { bets: bets.map((bet, slot) => ({ slot, stake: bet.stake, autoCashout: bet.autoCashout ?? null, state: 'ACTIVE' as const })) }
        }
      }
      flights.set(game, flight)
      return { round: inTheAir(flight), balance: after }
    },

    async cashOut (round, slot) {
      const flight = flights.get(round.game)
      if (!flight || flight.round.arcadeRoundId !== round.arcadeRoundId) throw new Error('There is no such round.')
      const after = settle(flight, slot)
      if (after.status === 'SETTLED') { flights.delete(round.game); keep(after) }
      return { round: after.status === 'ACTIVE' ? inTheAir(flight) : after, balance: balance() }
    },

    async activeCrash (game) {
      const flight = flights.get(game)
      if (!flight) return { round: null, landed: null, balance: null }
      const round = settle(flight)
      if (round.status === 'ACTIVE') return { round: inTheAir(flight), landed: null, balance: null }
      flights.delete(game)
      keep(round)
      return { round: null, landed: round, balance: balance() }
    },

    async history (game) {
      return recent.filter(round => !game || round.game === game)
    }
  }
}
