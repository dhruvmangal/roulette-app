import Logger from '~/libs/logger'
import { EvaluateAchievementsService } from './evaluateAchievements.service'

/**
 * Checks for new achievements after something happened, and never lets that
 * get in the way of what happened: a failure is logged and the caller
 * carries on. Returns the achievements unlocked (none if it failed).
 */
export const evaluateAchievements = async (context, args) => {
  try {
    const done = await EvaluateAchievementsService.execute(args, context)
    if (!done.successful) {
      Logger.error('Achievements', { message: 'Could not check achievements', fault: done.errors })
      return []
    }
    return done.result.unlocked
  } catch (exception) {
    Logger.error('Achievements', { message: 'Could not check achievements', exception })
    return []
  }
}
