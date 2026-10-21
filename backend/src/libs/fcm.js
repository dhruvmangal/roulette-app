import config from '~/configs/app.config'
import { createFcmClient, parseServiceAccount } from '~/utils/fcm.utils'

let client = null
let resolved = false

/** The push sender, or null while no Firebase service account is configured (push is then off). */
export const getFcmClient = () => {
  if (!resolved) {
    resolved = true
    const account = parseServiceAccount(config.get('push.fcmServiceAccount'))
    client = account ? createFcmClient(account) : null
  }
  return client
}
