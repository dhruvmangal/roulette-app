import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { ACHIEVEMENTS } from '~/utils/constants/achievement.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { computeMetrics } from '~/utils/achievement.utils'

const constraints = ajv.compile({ type: 'object', properties: { playerId: { type: 'integer', minimum: 1 } }, required: ['playerId'] })

/** Every achievement with how far along the player is, and when they earned it. */
export class GetAchievementsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerId } = this.args
    const { dbModels: { PlayerAchievement }, sequelize } = this.context

    const [metrics, earned] = await Promise.all([computeMetrics(sequelize, playerId), PlayerAchievement.findAll({ where: { playerId } })])
    const unlockedAt = new Map(earned.map(row => [row.code, row.unlockedAt]))

    const achievements = ACHIEVEMENTS.map(({ code, group, metric, target, reward }) => {
      const done = unlockedAt.has(code)
      return {
        code,
        group,
        target,
        reward,
        // An earned achievement stays full even if the number behind it later drops (a win streak ends).
        progress: done ? target : Math.min(Number(metrics[metric] ?? 0), target),
        unlockedAt: done ? unlockedAt.get(code) : null
      }
    })
    return {
      achievements,
      totals: {
        unlocked: earned.filter(row => achievements.some(entry => entry.code === row.code)).length,
        total: achievements.length,
        chipsEarned: earned.reduce((sum, row) => sum + Number(row.reward), 0)
      },
      message: SUCCESS_MSG.GET_SUCCESS
    }
  }
}
