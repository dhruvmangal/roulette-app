import { randomInt } from 'crypto'
import { BOT_STRATEGIES, validateBet } from '@roulette/engine'
import ServiceBase from '~/services/serviceBase'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { BET_STATUS, HISTORY_LENGTH, ROUND_STATUS } from '~/utils/constants/game.constants'
import { fromEngineBet, toBetView } from '~/utils/game.utils'
import { withTransaction } from '~/utils/transaction.utils'

/**
 * A bot takes its turn: the engine's strategy for its style picks the bets,
 * trimmed to the table limits, paid from its play chips (never the ledger).
 */
export class PlaceBotBetsService extends ServiceBase {
  async run () {
    const { roundId, roomPlayerId } = this.args
    const { dbModels: { Bet, Room, RoomPlayer, Round } } = this.context

    const placed = await withTransaction(this, async (transaction) => {
      const round = await Round.findByPk(roundId, { lock: transaction.LOCK.SHARE, transaction })
      if (round?.status !== ROUND_STATUS.BETTING) return null
      const bot = await RoomPlayer.findByPk(roomPlayerId, { lock: transaction.LOCK.UPDATE, transaction })
      if (!bot?.isBot || bot.leftAt) return null
      if (await Bet.count({ where: { roundId, roomPlayerId }, transaction })) return null

      const room = await Room.findByPk(round.roomId, { transaction })
      const recent = await Round.findAll({
        where: { roomId: room.roomId, status: ROUND_STATUS.SETTLED },
        order: [['roundNumber', 'DESC']],
        limit: HISTORY_LENGTH,
        transaction
      })
      const lastBets = recent.length
        ? await Bet.findAll({ where: { roundId: recent[0].roundId, roomPlayerId, status: [BET_STATUS.WON, BET_STATUS.LOST] }, transaction })
        : []
      const last = lastBets.length
        ? { totalStake: lastBets.reduce((s, b) => s + b.amount, 0), totalPayout: lastBets.reduce((s, b) => s + (b.payout || 0), 0) }
        : null

      const chosen = BOT_STRATEGIES[bot.botProfile.style]({
        variant: room.variant,
        balance: bot.botProfile.balance,
        history: recent.map(r => r.winningPocket),
        last,
        randomInt
      })
      const bets = []
      let total = 0
      for (const bet of chosen) {
        const amount = Math.max(bet.amount, room.minBet)
        if (total + amount > Math.min(room.maxBet, bot.botProfile.balance)) break
        if (!validateBet(room.variant, { ...bet, amount }).ok) continue
        bets.push({ ...bet, amount })
        total += amount
      }
      if (!bets.length) return null

      const rows = []
      for (const bet of bets) rows.push(await Bet.create({ roundId, roomPlayerId, playerId: null, ...fromEngineBet(bet) }, { transaction }))
      await bot.update({ botProfile: { ...bot.botProfile, balance: bot.botProfile.balance - total } }, { transaction })
      return { roomId: room.roomId, seat: bot.seat, rows }
    })
    if (!placed) return { bets: [] }

    const views = placed.rows.map(bet => toBetView(bet, placed.seat))
    RouletteEmitter.betsAccepted(placed.roomId, views)
    return { bets: views }
  }
}
