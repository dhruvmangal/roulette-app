import ServiceBase from '~/services/serviceBase'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { BET_STATUS, CHAT_KINDS, PHASE_MS, ROUND_STATUS } from '~/utils/constants/game.constants'
import { summarizeBets } from '~/utils/chat.utils'
import { toRoundView } from '~/utils/game.utils'
import { postTableLine } from '~/utils/tableLine.utils'
import { withTransaction } from '~/utils/transaction.utils'

/**
 * No more bets. Waits for bets still being placed (they hold the round with
 * a shared lock) and then shuts betting, so none can slip in afterwards.
 * Then each player's bets are told to the table as one chat line, unless
 * they turned that off.
 */
export class CloseBettingService extends ServiceBase {
  async run () {
    const { roundId } = this.args
    const { dbModels: { Round } } = this.context

    const round = await withTransaction(this, async (transaction) => {
      const current = await Round.findByPk(roundId, { lock: transaction.LOCK.UPDATE, transaction })
      if (current?.status !== ROUND_STATUS.BETTING) return null
      return current.update({ status: ROUND_STATUS.BETS_CLOSED, phaseEndsAt: new Date(Date.now() + PHASE_MS.BETS_CLOSED) }, { transaction })
    })
    if (round) {
      RouletteEmitter.roundPhase(round.roomId, toRoundView(round))
      // Chat is a nicety: it must not fail the round.
      try {
        await this.postBetLines(round)
      } catch (exception) {
        this.log.error('Could not write the bet lines', { roundId, exception })
      }
    }
    return { round }
  }

  async postBetLines (round) {
    const { dbModels: { Bet, ChatMessage, Player, RoomPlayer } } = this.context
    const bets = await Bet.findAll({ where: { roundId: round.roundId, status: BET_STATUS.PLACED }, order: [['betId', 'ASC']] })
    const bySeat = new Map()
    for (const bet of bets) {
      if (bet.playerId) bySeat.set(bet.roomPlayerId, [...(bySeat.get(bet.roomPlayerId) ?? []), bet])
    }
    for (const [roomPlayerId, seatBets] of bySeat) {
      const seat = await RoomPlayer.findByPk(roomPlayerId)
      if (!seat?.shareBets) continue
      const player = await Player.findByPk(seatBets[0].playerId)
      await postTableLine(ChatMessage, {
        roomId: round.roomId, seat, playerId: seat.playerId, name: player?.username ?? 'Player', kind: CHAT_KINDS.BETS, data: summarizeBets(seatBets)
      })
    }
  }
}
