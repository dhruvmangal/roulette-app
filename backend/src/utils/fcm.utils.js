import jwt from 'jsonwebtoken'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
// Refresh a little before Google's one-hour expiry.
const TOKEN_LIFETIME_S = 3300

/** The key as a Firebase service account object, from its JSON or the base64 of it; null if absent or unusable. */
export const parseServiceAccount = (text) => {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
    const account = JSON.parse(json)
    return account.client_email && account.private_key && account.project_id ? account : null
  } catch {
    return null
  }
}

/** What each FCM error means for the token: a dead token is deleted, anything else is only logged. */
export const classifyFcmError = (status, body) => {
  const code = body?.error?.details?.find(detail => detail.errorCode)?.errorCode ?? body?.error?.status
  if (code === 'UNREGISTERED' || code === 'NOT_FOUND') return 'dead-token'
  if (code === 'INVALID_ARGUMENT' && /registration token/i.test(body?.error?.message ?? '')) return 'dead-token'
  if (status === 401 || status === 403) return 'auth'
  if (status === 429 || status >= 500) return 'retry-later'
  return 'rejected'
}

/**
 * Sends push notifications through Firebase Cloud Messaging (HTTP v1), which
 * also delivers to iPhones through APNs. Signs in with a service account the
 * way Google's own libraries do, so no SDK is needed.
 */
export const createFcmClient = (serviceAccount, { fetchImpl = fetch, now = () => Date.now() } = {}) => {
  let cached = null

  const accessToken = async () => {
    if (cached && cached.expiresAt > now()) return cached.token
    const issued = Math.floor(now() / 1000)
    const assertion = jwt.sign(
      { iss: serviceAccount.client_email, scope: SCOPE, aud: TOKEN_URL, iat: issued, exp: issued + 3600 },
      serviceAccount.private_key,
      { algorithm: 'RS256' }
    )
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
    })
    const body = await response.json()
    if (!response.ok || !body.access_token) throw new Error(`FCM sign-in failed (${response.status})`)
    cached = { token: body.access_token, expiresAt: now() + TOKEN_LIFETIME_S * 1000 }
    return cached.token
  }

  return {
    projectId: serviceAccount.project_id,

    /** Sends one notification to one phone: { ok: true } or { ok: false, reason }. */
    async send (token, { title, body, data = {} }) {
      const response = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            // FCM data values must all be strings.
            data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])),
            android: { priority: 'high', notification: { channel_id: 'default' } },
            apns: { payload: { aps: { sound: 'default' } } }
          }
        })
      })
      if (response.ok) return { ok: true }
      const failure = await response.json().catch(() => ({}))
      return { ok: false, reason: classifyFcmError(response.status, failure), status: response.status }
    }
  }
}
