import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import { NotifyPlayerService } from '~/services/notification'
import { ApplyWalletTransactionService } from '~/services/wallet'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import { ACHIEVEMENT_GROUPS } from '~/utils/constants/achievement.constants'
import { NOTIFICATION_CATEGORIES } from '~/utils/constants/notification.constants'
import { SOCKET_EMITTERS } from '~/utils/constants/socket'
import { WALLET_DIRECTIONS, WALLET_REFERENCE_TYPES, WALLET_TRANSACTION_TYPES } from '~/utils/constants/wallet.constants'
import { computeMetrics, reached } from '~/utils/achievement.utils'
import { PUSH_TYPES } from '~/utils/pushMessages.utils'
import { inTransaction, withTransaction } from '~/utils/transaction.utils'

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerIds: { type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 64 },
    // Which kinds of achievement the event could have changed; all of them if left out.
    groups: { type: 'array', items: { enum: Object.values(ACHIEVEMENT_GROUPS) } },
    // Numbers the caller already knows (the daily streak a claim just reached), instead of looking them up.
    metrics: { type: 'object' }
  },
  required: ['playerIds']
})

/**
 * Internal: awards any achievements these players have now reached. Each one
 * is awarded once: the row and the chip reward are written together, and a
 * second evaluation at the same moment finds it taken. Safe to call as often
 * as there is something that might have changed.
 */
export class EvaluateAchievementsService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const { playerIds, groups, metrics: known = {} } = this.args
    const { dbModels: { PlayerAchievement }, sequelize } = this.context

    const unlocked = []
    for (const playerId of new Set(playerIds)) {
      const metrics = { ...await computeMetrics(sequelize, playerId, groups), ...known }
      const earned = (await PlayerAchievement.findAll({ where: { playerId } })).map(row => row.code)
      for (const achievement of reached(metrics, earned, groups)) {
        const award = await this.#award(playerId, achievement)
        if (!award) continue
        unlocked.push({ playerId, code: achievement.code, reward: achievement.reward })
        await this.#tell(playerId, achievement, award.wallet)
      }
    }
    return { unlocked }
  }

  /** Writes the achievement and pays its reward in one transaction; null if it was already awarded. */
  async #award (playerId, achievement) {
    const { dbModels: { PlayerAchievement } } = this.context
    const service = this
    return withTransaction(this, async (transaction) => {
      let row
      try {
        row = await PlayerAchievement.create({ playerId, code: achievement.code, reward: achievement.reward, unlockedAt: new Date() }, { transaction })
      } catch (error) {
        // Another evaluation got there first.
        if (error.name !== 'SequelizeUniqueConstraintError') throw error
        return null
      }
      if (!achievement.reward) return { wallet: null }
      const paid = await ApplyWalletTransactionService.execute({
        playerId,
        amount: achievement.reward,
        direction: WALLET_DIRECTIONS.CREDIT,
        type: WALLET_TRANSACTION_TYPES.ACHIEVEMENT_BONUS,
        referenceType: WALLET_REFERENCE_TYPES.BONUS,
        referenceId: `ACHIEVEMENT:${achievement.code}`,
        idempotencyKey: `achievement:${achievement.code}:player:${playerId}`,
        metadata: { achievement: achievement.code }
      }, inTransaction(this.context, transaction))
      if (!paid.successful) return service.mergeErrors(paid.errors)
      await row.update({ walletTransactionId: paid.result.walletTransaction.walletTransactionId }, { transaction })
      return { wallet: paid.result.wallet }
    })
  }

  async #tell (playerId, achievement, wallet) {
    if (wallet) RouletteEmitter.walletUpdated(playerId, wallet)
    const told = await NotifyPlayerService.execute({
      playerId,
      event: { name: SOCKET_EMITTERS.ROULETTE_ACHIEVEMENT_UNLOCKED, payload: { code: achievement.code, reward: achievement.reward } },
      push: {
        category: NOTIFICATION_CATEGORIES.ACHIEVEMENTS,
        type: PUSH_TYPES.achievement,
        vars: { reward: achievement.reward.toLocaleString('en-US') },
        data: { screen: 'achievements', code: achievement.code },
        dedupeKey: `achievement:${achievement.code}:${playerId}`
      }
    }, this.context)
    if (!told.successful) this.log.error('Could not tell a player about an achievement', { playerId, fault: told.errors })
  }
}
