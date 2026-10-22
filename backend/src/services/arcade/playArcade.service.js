import { ARCADE_LIMITS, HORSES, arcadePayout, horsePayout, horseRace, plinkoDrop, wheelSpin } from '@roulette/engine'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { ApplyWalletTransactionService } from '~/services/wallet'
import { secureRandomInt, toArcadeRoundView } from '~/utils/arcade.utils'
import { ARCADE_STATUS } from '~/utils/constants/arcade.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { WALLET_DIRECTIONS, WALLET_REFERENCE_TYPES, WALLET_TRANSACTION_TYPES } from '~/utils/constants/wallet.constants'
import { toWalletView } from '~/utils/player.utils'
import { inTransaction, withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    game: { enum: ['PLINKO', 'WHEEL', 'HORSES'] },
    stake: { type: 'integer' },
    rows: { type: 'integer' },
    risk: { enum: ['low', 'medium', 'high'] },
    bets: { type: 'array', maxItems: 6 },
    requestId: { type: 'string', minLength: 1, maxLength: 64 }
  },
  required: ['playerId', 'game', 'requestId']
})

/** Draws the game and says what it staked: one chip count in, one outcome out. */
function play ({ game, stake, rows, risk, bets }) {
  if (game === 'PLINKO') {
    const drop = plinkoDrop(rows, risk, secureRandomInt)
    return { staked: stake, payout: arcadePayout(stake, drop.multiplier), outcome: { rows, risk, ...drop } }
  }
  if (game === 'WHEEL') {
    const spin = wheelSpin(risk, secureRandomInt)
    return { staked: stake, payout: arcadePayout(stake, spin.multiplier), outcome: { risk, ...spin } }
  }
  const race = horseRace(secureRandomInt)
  return {
    staked: bets.reduce((sum, bet) => sum + bet.stake, 0),
    payout: horsePayout(bets, race),
    outcome: { bets, ...race, winner: race.order[0], odds: HORSES.map((horse) => horse.odds) }
  }
}

/**
 * Plinko, prize wheel and horse race: games that end the moment they are played. The stake is
 * taken from the wallet, the game is drawn on the server, and the winnings are paid back, all in
 * one transaction. A repeated requestId returns the round it already played.
 */
export class PlayArcadeService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, game, requestId } = this.args
    const { dbModels: { ArcadeRound, Wallet } } = this.context

    const choice = this.#checkChoice()
    if (!choice) return

    const played = await withTransaction(this, async (transaction) => {
      const replay = await ArcadeRound.findOne({ where: { playerId, requestId }, transaction })
      if (replay) {
        const wallet = await Wallet.findOne({ where: { playerId }, transaction })
        return { round: replay, wallet: toWalletView(wallet), replayed: true }
      }

      const result = play({ ...this.args, ...choice })
      const now = new Date()
      const round = await ArcadeRound.create({
        playerId,
        game,
        status: ARCADE_STATUS.SETTLED,
        stake: result.staked,
        payout: result.payout,
        outcome: result.outcome,
        requestId,
        startedAt: now,
        settledAt: now
      }, { transaction })

      const nested = inTransaction(this.context, transaction)
      const reference = { referenceType: WALLET_REFERENCE_TYPES.ARCADE, referenceId: String(round.arcadeRoundId) }
      let paid = await ApplyWalletTransactionService.execute({
        playerId,
        amount: result.staked,
        direction: WALLET_DIRECTIONS.DEBIT,
        type: WALLET_TRANSACTION_TYPES.BET,
        idempotencyKey: `arcade:bet:${round.arcadeRoundId}`,
        metadata: { game },
        ...reference
      }, nested)
      if (!paid.successful) return this.mergeErrors(paid.errors)
      if (result.payout > 0) {
        paid = await ApplyWalletTransactionService.execute({
          playerId,
          amount: result.payout,
          direction: WALLET_DIRECTIONS.CREDIT,
          type: WALLET_TRANSACTION_TYPES.WIN,
          idempotencyKey: `arcade:win:${round.arcadeRoundId}`,
          metadata: { game },
          ...reference
        }, nested)
        if (!paid.successful) return this.mergeErrors(paid.errors)
      }
      return { round, wallet: paid.result.wallet, replayed: false }
    })
    if (!played) return

    return { round: toArcadeRoundView(played.round), wallet: played.wallet, replayed: played.replayed, message: SUCCESS_MSG.ARCADE_PLAYED }
  }

  /** The stakes and picks the game needs, or an error for the first one that is missing or out of range. */
  #checkChoice () {
    const { game, stake, rows, risk, bets } = this.args
    const within = (amount) => Number.isInteger(amount) && amount >= ARCADE_LIMITS.minBet && amount <= ARCADE_LIMITS.maxBet
    if (game === 'HORSES') {
      if (!bets?.length) return this.addError('ArcadeBadChoiceErrorType', '(back at least one horse)')
      const horses = bets.map((bet) => bet.horse)
      if (horses.some((horse) => !Number.isInteger(horse) || horse < 0 || horse >= HORSES.length) || new Set(horses).size !== horses.length) {
        return this.addError('ArcadeBadChoiceErrorType', '(each horse once, numbered 0 to 5)')
      }
      if (!bets.every((bet) => within(bet.stake))) return this.addError('ArcadeBetLimitErrorType', `(${ARCADE_LIMITS.minBet} to ${ARCADE_LIMITS.maxBet} on each horse)`)
      return { bets: bets.map(({ horse, stake: each }) => ({ horse, stake: each })) }
    }
    if (!within(stake)) return this.addError('ArcadeBetLimitErrorType', `(${ARCADE_LIMITS.minBet} to ${ARCADE_LIMITS.maxBet})`)
    if (!risk) return this.addError('ArcadeBadChoiceErrorType', '(choose a risk)')
    if (game === 'PLINKO' && !(rows >= 8 && rows <= 16)) return this.addError('ArcadeBadChoiceErrorType', '(8 to 16 rows)')
    return {}
  }
}
