import http2 from 'http2'
import jwt from 'jsonwebtoken'

const PRODUCTION_HOST = 'https://api.push.apple.com'
const SANDBOX_HOST = 'https://api.sandbox.push.apple.com'
// Apple wants one token reused for a while, and refused if a new one is made more than every 20 minutes.
const TOKEN_LIFETIME_MS = 50 * 60 * 1000

/** The .p8 key from its text or the base64 of it; null if it doesn't look like a private key. */
export const parseApnsKey = (text) => {
  const raw = String(text || '').trim()
  if (!raw) return null
  const pem = raw.includes('BEGIN PRIVATE KEY') ? raw : Buffer.from(raw, 'base64').toString('utf8')
  return pem.includes('BEGIN PRIVATE KEY') ? pem : null
}

/** What each APNs answer means for the token: a dead one is deleted, anything else is only logged. */
export const classifyApnsError = (status, reason) => {
  if (status === 410 || reason === 'Unregistered' || reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic') return 'dead-token'
  if (status === 403 || reason === 'ExpiredProviderToken' || reason === 'InvalidProviderToken') return 'auth'
  if (status === 429 || status >= 500) return 'retry-later'
  return 'rejected'
}

/**
 * Sends push notifications to iPhones through Apple's push service directly (HTTP/2 with a
 * signed provider token), so the app needs no Firebase SDK. One connection is kept open
 * and made again if it drops.
 */
export const createApnsClient = ({ key, keyId, teamId, topic, production = false }, { connect = http2.connect, now = () => Date.now() } = {}) => {
  let session = null
  let cached = null

  const providerToken = () => {
    if (cached && cached.expiresAt > now()) return cached.token
    const token = jwt.sign({ iss: teamId, iat: Math.floor(now() / 1000) }, key, { algorithm: 'ES256', header: { alg: 'ES256', kid: keyId } })
    cached = { token, expiresAt: now() + TOKEN_LIFETIME_MS }
    return token
  }

  const connection = () => {
    if (!session || session.closed || session.destroyed) {
      session = connect(production ? PRODUCTION_HOST : SANDBOX_HOST)
      session.on('error', () => { session = null })
      session.on('close', () => { session = null })
    }
    return session
  }

  const request = (token, payload) => new Promise((resolve, reject) => {
    const stream = connection().request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${providerToken()}`,
      'apns-topic': topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json'
    })
    let status = 0
    let body = ''
    stream.setEncoding('utf8')
    stream.on('response', headers => { status = Number(headers[':status']) })
    stream.on('data', chunk => { body += chunk })
    stream.on('end', () => resolve({ status, body }))
    stream.on('error', reject)
    stream.setTimeout(10000, () => { stream.close(); reject(new Error('APNs timed out')) })
    stream.end(JSON.stringify(payload))
  })

  return {
    /** Sends one notification to one iPhone: { ok: true } or { ok: false, reason }. */
    async send (token, { title, body, data = {} }) {
      const { status, body: answer } = await request(token, { aps: { alert: { title, body }, sound: 'default' }, ...data })
      if (status === 200) return { ok: true }
      let reason = ''
      try { reason = JSON.parse(answer).reason } catch { /* no body */ }
      return { ok: false, reason: classifyApnsError(status, reason), status }
    },
    close () { session?.close() }
  }
}
