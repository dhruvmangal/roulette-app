import { resolveCrashBets } from '@roulette/engine'
import { ARCADE_STATUS } from '~/utils/constants/arcade.constants'
import { ApplyWalletTransactionService } from '~/services/wallet'
import { WALLET_DIRECTIONS, WALLET_REFERENCE_TYPES, WALLET_TRANSACTION_TYPES } from '~/utils/constants/wallet.constants'
import { inTransaction } from '~/utils/transaction.utils'

/**
 * Brings a flight up to date with the clock, inside the caller's transaction (the round row must
 * be locked): pays every bet that was cashed out, marks the ones that crashed, and closes the
 * round when none is left in the air. `cashNowSlot` is the bet whose owner pressed the button.
 * Returns false (after recording an error on `service`) when a payout fails.
 */
export async function settleFlight (service, round, transaction, { now = new Date(), cashNowSlot = null } = {}) {
  if (round.status !== ARCADE_STATUS.ACTIVE) return true
  const elapsedMs = now.getTime() - new Date(round.startedAt).getTime()
  const { bets, settled, over } = resolveCrashBets(round.outcome, elapsedMs, cashNowSlot)

  for (const bet of settled) {
    if (bet.payout <= 0) continue
    const paid = await ApplyWalletTransactionService.execute({
      playerId: round.playerId,
      amount: bet.payout,
      direction: WALLET_DIRECTIONS.CREDIT,
      type: WALLET_TRANSACTION_TYPES.WIN,
      referenceType: WALLET_REFERENCE_TYPES.ARCADE,
      referenceId: String(round.arcadeRoundId),
      idempotencyKey: `arcade:win:${round.arcadeRoundId}:${bet.slot}`,
      metadata: { game: round.game, multiplier: bet.multiplier }
    }, inTransaction(service.context, transaction))
    if (!paid.successful) { service.mergeErrors(paid.errors); return false }
  }

  if (settled.length) {
    const payout = bets.reduce((sum, bet) => sum + (bet.payout ?? 0), 0)
    await round.update({
      outcome: { ...round.outcome, bets },
      ...(over && { status: ARCADE_STATUS.SETTLED, payout, settledAt: now })
    }, { transaction })
  }
  return true
}
