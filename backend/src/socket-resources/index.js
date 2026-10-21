import { createAdapter } from '@socket.io/redis-adapter'
import { Server as SocketServer } from 'socket.io'
import { InternalServerErrorType } from '~/utils/constants/errors'
import i18n from '~/libs/i18n'
import Logger from '~/libs/logger'
import redisClient from '~/libs/redisClient'
import config from '~/configs/app.config'
import { getLocalizedError, isTrustedError } from '~/utils/error.utils'
import argumentsDecoratorSocketMiddleware from './middlewares/argumentsDecoratorSocket.middleware'
import namespaces from './namespaces'

const socketCorsOptions = {
  cors: { origin: config.get('origin') === '*' ? '*' : config.get('origin').split(',') }
}

const socketServer = new SocketServer(socketCorsOptions)

socketServer.on('new_namespace', (namespace) => {
  namespace.use((socket, next) => {
    const req = socket.request

    i18n.init(req)

    socket.on('error', (error) => {
      if (isTrustedError(error)) {
        socket.emit('error', { data: {}, errors: [getLocalizedError(error, socket.request.__)] })
      } else {
        Logger.error(
          (error.name || InternalServerErrorType.name),
          {
            message: error.message || error.description,
            fault: error.fields
          })
        socket.emit('error', { data: {}, errors: [getLocalizedError(InternalServerErrorType, socket.request.__)] })
      }
    })

    socket.use(argumentsDecoratorSocketMiddleware(socket))

    next()
  })
})

socketServer.adapter(createAdapter(redisClient.publisherClient, redisClient.subscriberClient))

namespaces(socketServer)

export default socketServer
