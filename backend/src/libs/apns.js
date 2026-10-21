import config from '~/configs/app.config'
import { createApnsClient, parseApnsKey } from '~/utils/apns.utils'
import { APP_ID } from '~/utils/appLinks.utils'

let client = null
let resolved = false

/** The iPhone push sender, or null while no Apple key is configured (iPhones then get no push). */
export const getApnsClient = () => {
  if (!resolved) {
    resolved = true
    const key = parseApnsKey(config.get('push.apns.key'))
    const keyId = config.get('push.apns.keyId')
    const teamId = config.get('push.apns.teamId')
    client = key && keyId && teamId
      ? createApnsClient({ key, keyId, teamId, topic: config.get('push.apns.bundleId') || APP_ID, production: config.get('push.apns.production') })
      : null
  }
  return client
}
