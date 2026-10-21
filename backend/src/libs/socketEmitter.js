import { Emitter } from '@socket.io/redis-emitter'
import redisClient from './redisClient'

const socketEmitter = new Emitter(redisClient.publisherClient)

export default socketEmitter
