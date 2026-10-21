export type VariantName = 'AMERICAN' | 'ENGLISH'

/** Canonical pocket label: '0', '00' or '1'..'36'. */
export type Pocket = string

export type PocketColor = 'red' | 'black' | 'green'

export type InsideBetType = 'STRAIGHT' | 'SPLIT' | 'STREET' | 'CORNER' | 'SIX_LINE' | 'TOP_LINE'
export type IndexedBetType = 'COLUMN' | 'DOZEN'
export type EvenMoneyBetType = 'RED' | 'BLACK' | 'ODD' | 'EVEN' | 'LOW' | 'HIGH'
export type BetType = InsideBetType | IndexedBetType | EvenMoneyBetType

export type BetSelection =
  | { type: InsideBetType, pockets: Pocket[] }
  | { type: IndexedBetType, index: 1 | 2 | 3 }
  | { type: EvenMoneyBetType }

export type Bet = BetSelection & { amount: number }

export type BetErrorCode =
  | 'InvalidBet'
  | 'UnknownBetType'
  | 'BetTypeNotAllowed'
  | 'InvalidSelection'
  | 'InvalidAmount'

export type BetValidation =
  | { ok: true, bet: Bet, covered: Pocket[] }
  | { ok: false, error: BetErrorCode }

export interface SettledBet {
  bet: Bet
  won: boolean
  /** Stake plus winnings when won, otherwise 0. */
  payout: number
}

export interface Settlement {
  winningPocket: Pocket
  results: SettledBet[]
  totalStake: number
  totalPayout: number
}

/** Returns an integer in [0, maxExclusive). On the server pass crypto.randomInt. */
export type RandomInt = (maxExclusive: number) => number
