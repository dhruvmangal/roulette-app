import ServiceBase from '~/services/serviceBase'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { ROOM_STATUS } from '~/utils/constants/game.constants'
import { LIVE_ROUND_STATUSES, toRoundView } from '~/utils/game.utils'
import { withTransaction } from '~/utils/transaction.utils'

/** Starts the next round with betting open. Returns the live round if one is already running. */
export class OpenRoundService extends ServiceBase {
  async run () {
    const { roomId } = this.args
    const { dbModels: { Room, Round } } = this.context

    const opened = await withTransaction(this, async (transaction) => {
      const room = await Room.findByPk(roomId, { lock: transaction.LOCK.UPDATE, transaction })
      if (!room) return this.addError('RoomNotFoundErrorType', `${roomId}`)
      if (room.status === ROOM_STATUS.ENDED) return this.addError('RoomEndedErrorType', room.code)

      const live = await Round.findOne({ where: { roomId, status: LIVE_ROUND_STATUSES }, transaction })
      if (live) return { round: live, created: false }

      const roundNumber = (await Round.max('roundNumber', { where: { roomId }, transaction }) || 0) + 1
      const now = new Date()
      const round = await Round.create({
        roomId,
        roundNumber,
        status: 'BETTING',
        phaseEndsAt: new Date(now.getTime() + room.bettingSeconds * 1000),
        startedAt: now
      }, { transaction })
      return { round, created: true }
    })
    if (!opened) return

    if (opened.created) RouletteEmitter.roundPhase(roomId, toRoundView(opened.round))
    return opened
  }
}
