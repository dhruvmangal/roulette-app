import { randomInt } from 'crypto'
import { spin } from '@roulette/engine'
import ServiceBase from '~/services/serviceBase'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { PHASE_MS, ROUND_STATUS } from '~/utils/constants/game.constants'
import { toRoundView } from '~/utils/game.utils'
import { withTransaction } from '~/utils/transaction.utils'

/** Draws the winning pocket with the server's CSPRNG and tells the table, so wheels can animate to it. */
export class SpinRoundService extends ServiceBase {
  async run () {
    const { roundId } = this.args
    const { dbModels: { Room, Round } } = this.context

    const round = await withTransaction(this, async (transaction) => {
      const current = await Round.findByPk(roundId, { lock: transaction.LOCK.UPDATE, transaction })
      if (current?.status !== ROUND_STATUS.BETS_CLOSED) return null
      const room = await Room.findByPk(current.roomId, { transaction })
      return current.update({
        status: ROUND_STATUS.SPINNING,
        winningPocket: spin(room.variant, randomInt),
        phaseEndsAt: new Date(Date.now() + PHASE_MS.SPINNING)
      }, { transaction })
    })
    if (round) RouletteEmitter.roundPhase(round.roomId, toRoundView(round))
    return { round }
  }
}
