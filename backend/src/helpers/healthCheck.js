import Logger from '~/libs/logger'
import { sequelize } from '~/db/models'
import redisClient from '~/libs/redisClient'

export default async () => {
  let healthy = true

  try {
    await sequelize.authenticate()
    Logger.info('HealthCheck', { message: 'Database Connection: has been established successfully.' })
  } catch (error) {
    healthy = false
    Logger.error('HealthCheck', { message: 'Database Connection: Failed to connect', exception: error })
    throw error
  }

  try {
    if (redisClient.publisherClient.status === 'ready' && redisClient.subscriberClient.status === 'ready') {
      Logger.info('HealthCheck', { message: 'Redis Connection: has been established successfully.' })
    } else {
      healthy = false
      Logger.error('HealthCheck', { message: 'Redis Connection: Failed to connect' })
    }
  } catch (error) {
    Logger.error('HealthCheck', { message: 'Redis Connection: Failed to connect', exception: error })
    throw error
  }

  const healthCheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now()
  }

  if (healthy) {
    return healthCheck
  } else {
    throw new Error()
  }
}
