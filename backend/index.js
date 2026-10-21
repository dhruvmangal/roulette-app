import { createServer } from 'http'
import config from '~/configs/app.config'
import '~/json-schemas'
import gracefulShutDown from '~/helpers/gracefulShutDown'
import Logger from '~/libs/logger'
import notificationJobs from '~/libs/notificationJobs'
import roundOrchestrator from '~/libs/roundOrchestrator'
import models from '~/db/models'
import app from '~/rest-resources'
import { EnsureBootstrapAdminService } from '~/services/admin'
import socketServer from '~/socket-resources'

const httpServer = createServer(app)
socketServer.attach(httpServer)

httpServer.listen({ port: config.get('port') }, () => {
  Logger.info('Server Started', { message: `Listening On ${config.get('port')}` })
  EnsureBootstrapAdminService.run({}, { dbModels: models, logger: Logger })
    .catch(error => Logger.error('EnsureBootstrapAdmin', { message: 'Failed to create the bootstrap admin', exception: error }))
  notificationJobs.start()
  roundOrchestrator.start().catch(error => Logger.error('RoundOrchestrator', { message: 'Failed to start', exception: error }))
})

process.on('SIGTERM', gracefulShutDown)
process.on('SIGINT', gracefulShutDown)
process.on('SIGUSR2', gracefulShutDown)
