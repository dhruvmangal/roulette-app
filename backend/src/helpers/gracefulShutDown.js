import { sequelize } from '~/db/models'
import redisClient from '~/libs/redisClient'
import roundOrchestrator from '~/libs/roundOrchestrator'

export default async function gracefulShutDown (signal) {
  try {
    // Hand rooms back first so another server resumes them straight away.
    await roundOrchestrator.stop()
    await sequelize.close()
    redisClient.client.disconnect()
    redisClient.publisherClient.disconnect()
    redisClient.subscriberClient.disconnect()
    console.log(`Received ${signal}`)
  } catch (err) {
    console.log('GraceFul ShutDown Failed', err)
  }
  process.exit(0)
}
