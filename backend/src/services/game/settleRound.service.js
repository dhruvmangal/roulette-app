import { settle } from '@roulette/engine'
import ServiceBase from '~/services/serviceBase'
import { evaluateAchievements } from '~/services/achievement'
import { QualifyReferralsService } from '~/services/referral'
import { ApplyWalletTransactionService } from '~/services/wallet'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { BET_STATUS, CHAT_KINDS, PHASE_MS, ROUND_STATUS } from '~/utils/constants/game.constants'
import { WALLET_DIRECTIONS, WALLET_REFERENCE_TYPES, WALLET_TRANSACTION_TYPES } from '~/utils/constants/wallet.constants'
import { toEngineBet, toRoundView } from '~/utils/game.utils'
import { postTableLine } from '~/utils/tableLine.utils'
import { inTransaction, withTransaction } from '~/utils/transaction.utils'

/**
 * Pays out a spun round in one transaction: the engine decides every bet,
 * winners are credited through the ledger, bots' play chips are updated.
 * Settles exactly once — a second call finds the round already SETTLED, and
 * the WIN rows are idempotent on the bet id as well.
 */
export class SettleRoundService extends ServiceBase {
  async run () {
    const { roundId } = this.args
    const { dbModels: { Bet, Room, RoomPlayer, Round } } = this.context

    const settled = await withTransaction(this, async (transaction) => {
      const round = await Round.findByPk(roundId, { lock: transaction.LOCK.UPDATE, transaction })
      if (round?.status !== ROUND_STATUS.SPINNING) return null
      const room = await Room.findByPk(round.roomId, { transaction })
      const bets = await Bet.findAll({ where: { roundId, status: BET_STATUS.PLACED }, order: [['betId', 'ASC']], transaction })

      const bySeat = new Map()
      for (const bet of bets) bySeat.set(bet.roomPlayerId, [...(bySeat.get(bet.roomPlayerId) || []), bet])

      const seats = []
      const wallets = {}
      for (const [roomPlayerId, seatBets] of bySeat) {
        const outcome = settle(room.variant, seatBets.map(toEngineBet), round.winningPocket)
        const playerId = seatBets[0].playerId
        for (const [i, bet] of seatBets.entries()) {
          const { won, payout } = outcome.results[i]
          let payoutTransactionId = null
          if (playerId && payout > 0) {
            const credited = await ApplyWalletTransactionService.execute({
              playerId,
              amount: payout,
              direction: WALLET_DIRECTIONS.CREDIT,
              type: WALLET_TRANSACTION_TYPES.WIN,
              referenceType: WALLET_REFERENCE_TYPES.BET,
              referenceId: String(bet.betId),
              idempotencyKey: `win:bet:${bet.betId}`
            }, inTransaction(this.context, transaction))
            if (!credited.successful) return this.mergeErrors(credited.errors)
            payoutTransactionId = credited.result.walletTransaction.walletTransactionId
            wallets[playerId] = credited.result.wallet
          }
          await bet.update({ status: won ? BET_STATUS.WON : BET_STATUS.LOST, payout, payoutTransactionId }, { transaction })
        }
        const seat = await RoomPlayer.findByPk(roomPlayerId, { lock: transaction.LOCK.UPDATE, transaction })
        if (seat.isBot && outcome.totalPayout) {
          await seat.update({ botProfile: { ...seat.botProfile, balance: seat.botProfile.balance + outcome.totalPayout } }, { transaction })
        }
        seats.push({
          roomPlayerId,
          seat: seat.seat,
          playerId: playerId ?? null,
          staked: outcome.totalStake,
          returned: outcome.totalPayout,
          net: outcome.totalPayout - outcome.totalStake,
          // A winning straight-up bet: the one that pays 35 to 1.
          jackpot: seatBets.some((bet, i) => bet.betType === 'STRAIGHT' && outcome.results[i].won)
        })
      }

      const now = new Date()
      await round.update({ status: ROUND_STATUS.SETTLED, resultAt: now, phaseEndsAt: new Date(now.getTime() + PHASE_MS.RESULT) }, { transaction })
      return { round, seats, wallets }
    })
    if (!settled) return { round: null }

    const { round, seats, wallets } = settled
    RouletteEmitter.roundPhase(round.roomId, toRoundView(round))
    RouletteEmitter.roundResult(round.roomId, {
      roundId, roundNumber: round.roundNumber, pocket: round.winningPocket, seats: seats.map(({ jackpot, ...seat }) => seat)
    })
    for (const [playerId, wallet] of Object.entries(wallets)) RouletteEmitter.walletUpdated(Number(playerId), wallet)

    try {
      await this.postResultLines(round, seats)
    } catch (exception) {
      this.log.error('Could not write the result lines', { roundId, exception })
    }

    // A referred friend may have just played their qualifying round. Not part of
    // the settlement: a failure here is logged and retried after the next round.
    const humans = [...new Set(seats.map(seat => seat.playerId).filter(Boolean))]
    try {
      const referrals = await QualifyReferralsService.execute({ playerIds: humans }, this.context)
      if (!referrals.successful) this.log.error('Referral check failed', { roundId, fault: referrals.errors })
    } catch (exception) {
      this.log.error('Referral check failed', { roundId, exception })
    }
    // And they may have just earned an achievement: first win, a streak, a big hit.
    await evaluateAchievements(this.context, { playerIds: humans, groups: ['play', 'hosted'] })
    return settled
  }

  /** One chat line per human who staked and shares their bets: what came of the round. */
  async postResultLines (round, seats) {
    const { dbModels: { ChatMessage, Player, RoomPlayer } } = this.context
    for (const { roomPlayerId, playerId, staked, net, jackpot } of seats) {
      if (!playerId || !staked) continue
      const seat = await RoomPlayer.findByPk(roomPlayerId)
      if (!seat?.shareBets) continue
      const player = await Player.findByPk(playerId)
      await postTableLine(ChatMessage, {
        roomId: round.roomId,
        seat,
        playerId,
        name: player?.username ?? 'Player',
        kind: CHAT_KINDS.RESULT,
        data: { roundNumber: round.roundNumber, pocket: round.winningPocket, staked, returned: staked + net, jackpot }
      })
    }
  }
}
