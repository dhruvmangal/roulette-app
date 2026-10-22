import { ARCADE_LIMITS, CRASH_SLOTS, crashPoint } from '@roulette/engine'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { ApplyWalletTransactionService } from '~/services/wallet'
import { secureRandomInt, toArcadeRoundView } from '~/utils/arcade.utils'
import { settleFlight } from '~/utils/crashFlight.utils'
import { ARCADE_STATUS, CRASH_BET_STATE } from '~/utils/constants/arcade.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { WALLET_DIRECTIONS, WALLET_REFERENCE_TYPES, WALLET_TRANSACTION_TYPES } from '~/utils/constants/wallet.constants'
import { toWalletView } from '~/utils/player.utils'
import { inTransaction, withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    game: { enum: ['AVIATOR'] },
    bets: { type: 'array', minItems: 1, maxItems: 2 },
    requestId: { type: 'string', minLength: 1, maxLength: 64 }
  },
  required: ['playerId', 'game', 'bets', 'requestId']
})

const isCents = (value) => Math.round(value * 100) / 100 === value

/**
 * Sends a flight up: takes the stake of each bet and draws where the flight will end. The end
 * stays on the server; the client only learns it when the flight is over. One flight per game at a
 * time, but a flight the player walked away from is settled first (auto cash-outs are paid).
 */
export class StartCrashService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, game, bets, requestId } = this.args
    const { dbModels: { ArcadeRound, Wallet } } = this.context

    if (bets.length > CRASH_SLOTS[game]) return this.addError('ArcadeBadChoiceErrorType', `(${game} takes up to ${CRASH_SLOTS[game]} bets)`)
    for (const bet of bets) {
      if (!Number.isInteger(bet.stake) || bet.stake < ARCADE_LIMITS.minBet || bet.stake > ARCADE_LIMITS.maxBet) {
        return this.addError('ArcadeBetLimitErrorType', `(${ARCADE_LIMITS.minBet} to ${ARCADE_LIMITS.maxBet})`)
      }
      if (bet.autoCashout != null && (!isCents(bet.autoCashout) || bet.autoCashout < 1.01 || bet.autoCashout > 1000)) {
        return this.addError('ArcadeBadChoiceErrorType', '(auto cash-out is 1.01 to 1000, in cents)')
      }
    }

    let started
    try {
      started = await withTransaction(this, async (transaction) => {
        const replay = await ArcadeRound.findOne({ where: { playerId, requestId }, transaction })
        if (replay) {
          const wallet = await Wallet.findOne({ where: { playerId }, transaction })
          return { round: replay, wallet: toWalletView(wallet), replayed: true }
        }

        // A flight the player left behind: land it before sending another.
        const open = await ArcadeRound.findOne({ where: { playerId, game, status: ARCADE_STATUS.ACTIVE }, lock: transaction.LOCK.UPDATE, transaction })
        if (open) {
          if (!await settleFlight(this, open, transaction)) return
          if (open.status === ARCADE_STATUS.ACTIVE) return this.addError('ArcadeRoundActiveErrorType', '')
        }

        const now = new Date()
        const round = await ArcadeRound.create({
          playerId,
          game,
          status: ARCADE_STATUS.ACTIVE,
          stake: bets.reduce((sum, bet) => sum + bet.stake, 0),
          payout: 0,
          outcome: {
            crashPoint: crashPoint(secureRandomInt),
            bets: bets.map((bet, slot) => ({ slot, stake: bet.stake, autoCashout: bet.autoCashout ?? null, state: CRASH_BET_STATE.ACTIVE }))
          },
          requestId,
          startedAt: now
        }, { transaction })

        let wallet
        for (const [slot, bet] of bets.entries()) {
          const paid = await ApplyWalletTransactionService.execute({
            playerId,
            amount: bet.stake,
            direction: WALLET_DIRECTIONS.DEBIT,
            type: WALLET_TRANSACTION_TYPES.BET,
            referenceType: WALLET_REFERENCE_TYPES.ARCADE,
            referenceId: String(round.arcadeRoundId),
            idempotencyKey: `arcade:bet:${round.arcadeRoundId}:${slot}`,
            metadata: { game }
          }, inTransaction(this.context, transaction))
          if (!paid.successful) return this.mergeErrors(paid.errors)
          wallet = paid.result.wallet
        }
        return { round, wallet, replayed: false }
      })
    } catch (error) {
      // The unique index allows one flight in the air; a second start that raced past the check lands here.
      if (error?.name === 'SequelizeUniqueConstraintError') return this.addError('ArcadeRoundActiveErrorType', '')
      throw error
    }
    if (!started) return

    return { round: toArcadeRoundView(started.round), wallet: started.wallet, replayed: started.replayed, message: SUCCESS_MSG.CRASH_STARTED }
  }
}
