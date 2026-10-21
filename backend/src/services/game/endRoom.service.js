import { Op, QueryTypes } from 'sequelize'
import ServiceBase from '~/services/serviceBase'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { BET_STATUS, ROOM_STATUS, ROUND_STATUS } from '~/utils/constants/game.constants'
import { toRoundView } from '~/utils/game.utils'
import { inTransaction, withTransaction } from '~/utils/transaction.utils'
import { RefundBetsService } from './refundBets.service'

/**
 * Closes a table. A round still taking bets is cancelled and refunded; a
 * wheel already spinning is still paid out by the orchestrator. Everyone gets
 * the session summary.
 */
export class EndRoomService extends ServiceBase {
  async run () {
    const { roomId } = this.args
    const { dbModels: { Bet, Room, RoomPlayer, Round }, sequelize } = this.context

    const ended = await withTransaction(this, async (transaction) => {
      const room = await Room.findByPk(roomId, { lock: transaction.LOCK.UPDATE, transaction })
      if (!room) return this.addError('RoomNotFoundErrorType', `${roomId}`)
      if (room.status === ROOM_STATUS.ENDED) return { alreadyEnded: true }

      const now = new Date()
      const round = await Round.findOne({
        where: { roomId, status: [ROUND_STATUS.BETTING, ROUND_STATUS.BETS_CLOSED] },
        lock: transaction.LOCK.UPDATE,
        transaction
      })
      let refunds = { betIds: [], wallets: {} }
      if (round) {
        const bets = await Bet.findAll({ where: { roundId: round.roundId, status: BET_STATUS.PLACED }, transaction })
        const refunded = await RefundBetsService.execute({ bets }, inTransaction(this.context, transaction))
        if (!refunded.successful) return this.mergeErrors(refunded.errors)
        refunds = refunded.result
        await round.update({ status: ROUND_STATUS.CANCELLED, phaseEndsAt: now }, { transaction })
      }

      await room.update({ status: ROOM_STATUS.ENDED }, { transaction })
      await RoomPlayer.update({ leftAt: now }, { where: { roomId, leftAt: { [Op.is]: null } }, transaction })
      return { round, refunds }
    })
    if (!ended || ended.alreadyEnded) return ended && { roomId, ended: true }

    if (ended.round) {
      RouletteEmitter.roundPhase(roomId, toRoundView(ended.round))
      if (ended.refunds.betIds.length) RouletteEmitter.betsRemoved(roomId, ended.refunds.betIds)
      for (const [playerId, wallet] of Object.entries(ended.refunds.wallets)) RouletteEmitter.walletUpdated(Number(playerId), wallet)
    }

    const summary = await sequelize.query(`
      SELECT rp.room_player_id AS "roomPlayerId", rp.seat, rp.player_id AS "playerId", rp.is_bot AS "isBot",
             coalesce(rp.bot_profile->>'name', p.username) AS name,
             count(DISTINCT b.round_id) AS "roundsPlayed",
             coalesce(sum(b.amount), 0)::bigint AS staked,
             coalesce(sum(b.payout), 0)::bigint AS returned,
             (coalesce(sum(b.payout), 0) - coalesce(sum(b.amount), 0))::bigint AS net,
             coalesce(max(b.payout - b.amount) FILTER (WHERE b.status = 'WON'), 0) AS "biggestWin"
      FROM room_players rp
      LEFT JOIN players p ON p.player_id = rp.player_id
      LEFT JOIN bets b ON b.room_player_id = rp.room_player_id AND b.status IN ('WON', 'LOST')
      WHERE rp.room_id = :roomId
      GROUP BY rp.room_player_id, p.username
      ORDER BY net DESC, rp.seat
    `, { replacements: { roomId }, type: QueryTypes.SELECT })

    RouletteEmitter.roomEnded(roomId, summary)
    return { roomId, ended: true, summary }
  }
}
