import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { toArcadeRoundView } from '~/utils/arcade.utils'
import { ARCADE_GAMES } from '@roulette/engine'
import { ARCADE_HISTORY_LIMIT, ARCADE_STATUS } from '~/utils/constants/arcade.constants'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    game: { enum: ['AVIATOR', 'PLINKO', 'WHEEL', 'HORSES'] },
    limit: { type: 'integer', minimum: 1, maximum: ARCADE_HISTORY_LIMIT }
  },
  required: ['playerId']
})

/** The player's most recent finished plays, newest first, optionally of one game. */
export class GetArcadeHistoryService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId, game, limit = 20 } = this.args
    const { dbModels: { ArcadeRound } } = this.context
    const rounds = await ArcadeRound.findAll({
      // Crash was taken out of the arcade; its old rounds stay in the table but are not listed.
      where: { playerId, status: ARCADE_STATUS.SETTLED, game: game ?? ARCADE_GAMES },
      order: [['arcadeRoundId', 'DESC']],
      limit
    })
    return { rounds: rounds.map((round) => toArcadeRoundView(round)) }
  }
}
