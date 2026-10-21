import { createHash, createPublicKey } from 'crypto'
import jwt from 'jsonwebtoken'
import config from '~/configs/app.config'
import { IDENTITY_PROVIDERS } from '~/utils/constants/player.constants'

/**
 * Verifies Google and Apple ID tokens (OpenID Connect) without any SDK: the
 * token's RS256 signature is checked against the provider's published keys
 * (JWKS), then its issuer, audience (our client IDs), expiry and nonce.
 */

const PROVIDERS = {
  [IDENTITY_PROVIDERS.GOOGLE]: {
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    audiences: () => config.get('auth.googleClientIds'),
    // Google echoes the nonce as given.
    hashNonce: false
  },
  [IDENTITY_PROVIDERS.APPLE]: {
    jwksUrl: 'https://appleid.apple.com/auth/keys',
    issuers: ['https://appleid.apple.com'],
    audiences: () => config.get('auth.appleClientIds'),
    // Apple is sent sha256(nonce), and that is what comes back.
    hashNonce: true
  }
}

// Keys are cached for as long as the provider's Cache-Control allows, and an
// unknown key id triggers at most one refetch a minute, so forged key ids
// cannot make the server hammer the provider.
const DEFAULT_KEY_TTL_MS = 60 * 60 * 1000
const MIN_REFETCH_MS = 60 * 1000
const CLOCK_TOLERANCE_SECONDS = 60

const sha256 = (value) => createHash('sha256').update(value).digest('hex')

/** A cache of one provider's signing keys, by key id. */
export function createKeySet ({ jwksUrl, fetch = globalThis.fetch, now = Date.now }) {
  let keys = new Map()
  let freshUntil = 0
  let fetchedAt = -Infinity
  let loading = null

  async function load () {
    fetchedAt = now()
    const response = await fetch(jwksUrl)
    if (!response.ok) throw new Error(`JWKS ${jwksUrl} answered ${response.status}`)
    const { keys: jwks = [] } = await response.json()
    const next = new Map()
    for (const jwk of jwks) {
      if (jwk.kty === 'RSA' && jwk.kid) next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }))
    }
    const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') || '')?.[1])
    keys = next
    freshUntil = now() + (Number.isFinite(maxAge) ? maxAge * 1000 : DEFAULT_KEY_TTL_MS)
  }

  return async function getKey (kid) {
    const stale = now() >= freshUntil
    if (keys.has(kid) && !stale) return keys.get(kid)
    if (stale || now() - fetchedAt >= MIN_REFETCH_MS) {
      try {
        await (loading ??= load().finally(() => { loading = null }))
      } catch {
        // The provider is unreachable: fall back to the keys we already have.
      }
    }
    return keys.get(kid) ?? null
  }
}

/**
 * @param {object} options
 * @param {string[]} options.issuers
 * @param {string[]} options.audiences our client IDs
 * @param {boolean} options.hashNonce
 * @param {(kid: string) => Promise<?import('crypto').KeyObject>} options.getKey
 * @returns {(idToken: string, options?: { nonce?: string }) => Promise<
 *   { ok: true, identity: { subject: string, email: ?string, name: ?string } } | { ok: false, reason: string }>}
 */
export function createIdentityVerifier ({ issuers, audiences, hashNonce, getKey }) {
  return async function verify (idToken, { nonce } = {}) {
    const decoded = jwt.decode(idToken, { complete: true })
    if (!decoded || decoded.header.alg !== 'RS256' || !decoded.header.kid) return { ok: false, reason: 'Malformed' }

    const key = await getKey(decoded.header.kid)
    if (!key) return { ok: false, reason: 'UnknownKey' }

    let claims
    try {
      claims = jwt.verify(idToken, key, {
        algorithms: ['RS256'],
        issuer: issuers,
        audience: audiences,
        clockTolerance: CLOCK_TOLERANCE_SECONDS
      })
    } catch (error) {
      return { ok: false, reason: error.name === 'TokenExpiredError' ? 'Expired' : 'Invalid' }
    }
    if (typeof claims.sub !== 'string' || !claims.sub) return { ok: false, reason: 'NoSubject' }
    if (nonce !== undefined && claims.nonce !== (hashNonce ? sha256(nonce) : nonce)) return { ok: false, reason: 'NonceMismatch' }

    // Only a provider-verified address is worth keeping (Apple sends the flag as a string).
    const verified = claims.email_verified === true || claims.email_verified === 'true'
    return { ok: true, identity: { subject: claims.sub, email: verified ? claims.email ?? null : null, name: claims.name ?? null } }
  }
}

const verifiers = new Map()

/** The verifier for a provider, or null when no client IDs are configured for it. */
export function identityVerifier (provider) {
  const settings = PROVIDERS[provider]
  const audiences = settings?.audiences().split(',').map(id => id.trim()).filter(Boolean)
  if (!audiences?.length) return null
  const cacheKey = `${provider}:${audiences.join(',')}`
  if (!verifiers.has(cacheKey)) {
    verifiers.set(cacheKey, createIdentityVerifier({ ...settings, audiences, getKey: createKeySet({ jwksUrl: settings.jwksUrl }) }))
  }
  return verifiers.get(cacheKey)
}
