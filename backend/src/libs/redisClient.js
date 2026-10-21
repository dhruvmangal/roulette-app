import Redis from 'ioredis'
import config from '~/configs/app.config'

const connection = {
  host: config.get('redis_db.host'),
  port: config.get('redis_db.port'),
  password: config.get('redis_db.password') || undefined
}

export default {
  connection,
  publisherClient: new Redis(connection),
  subscriberClient: new Redis(connection),
  client: new Redis(connection)
}
