import { createHash, generateKeyPairSync } from 'crypto'
import jwt from 'jsonwebtoken'
import { createIdentityVerifier, createKeySet } from '~/utils/identityToken.utils'

const GOOGLE = { issuers: ['https://accounts.google.com', 'accounts.google.com'], hashNonce: false }
const APPLE = { issuers: ['https://appleid.apple.com'], hashNonce: true }
const CLIENT_ID = 'web-client.apps.googleusercontent.com'

/** A provider: an RSA key pair published as a JWKS, and a way to sign ID tokens with it. */
function provider (kid = 'key-1') {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }
  const sign = (claims = {}, { keyid = kid, issuer = 'https://accounts.google.com', expiresIn = '10m' } = {}) =>
    jwt.sign({ sub: 'user-123', email: 'ana@example.com', email_verified: true, name: 'Ana', ...claims }, privateKey,
      { algorithm: 'RS256', keyid, issuer, audience: CLIENT_ID, expiresIn })
  return { jwk, sign, privateKey, publicKey }
}

/** A fetch serving JWKS documents, counting requests; `serve` swaps what it returns. */
function jwksServer (jwks, { maxAge = 3600 } = {}) {
  const server = { requests: 0, jwks, failing: false }
  server.fetch = async () => {
    server.requests++
    if (server.failing) throw new TypeError('offline')
    return new Response(JSON.stringify({ keys: server.jwks }), { headers: { 'cache-control': `public, max-age=${maxAge}` } })
  }
  return server
}

function verifierFor (settings, server, now = () => Date.now()) {
  return createIdentityVerifier({ ...settings, audiences: [CLIENT_ID], getKey: createKeySet({ jwksUrl: 'https://keys', fetch: server.fetch, now }) })
}

describe('identity token verification', () => {
  const google = provider()
  let server
  let verify

  beforeEach(() => {
    server = jwksServer([google.jwk])
    verify = verifierFor(GOOGLE, server)
  })

  it('accepts a genuine token and returns the stable subject', async () => {
    expect(await verify(google.sign())).toEqual({ ok: true, identity: { subject: 'user-123', email: 'ana@example.com', name: 'Ana' } })
  })

  it('rejects tokens meant for another app, from another issuer, or expired', async () => {
    const otherApp = jwt.sign({ sub: 'x' }, google.privateKey, { algorithm: 'RS256', keyid: 'key-1', issuer: 'https://accounts.google.com', audience: 'someone-else', expiresIn: '10m' })
    expect(await verify(otherApp)).toEqual({ ok: false, reason: 'Invalid' })
    expect(await verify(google.sign({}, { issuer: 'https://evil.example' }))).toEqual({ ok: false, reason: 'Invalid' })
    expect(await verify(google.sign({}, { expiresIn: -3600 }))).toEqual({ ok: false, reason: 'Expired' })
  })

  it('rejects a token signed by someone else under a real key id', async () => {
    const attacker = provider('key-1')
    expect(await verify(attacker.sign())).toEqual({ ok: false, reason: 'Invalid' })
  })

  it('rejects unsigned and HMAC tokens', async () => {
    const none = jwt.sign({ sub: 'x' }, null, { algorithm: 'none', audience: CLIENT_ID, issuer: 'accounts.google.com' })
    const hmac = jwt.sign({ sub: 'x' }, 'secret', { algorithm: 'HS256', keyid: 'key-1', audience: CLIENT_ID, issuer: 'accounts.google.com' })
    expect(await verify(none)).toEqual({ ok: false, reason: 'Malformed' })
    expect(await verify(hmac)).toEqual({ ok: false, reason: 'Malformed' })
    expect(await verify('not.a.token')).toEqual({ ok: false, reason: 'Malformed' })
  })

  it('does not keep an email the provider has not verified', async () => {
    const { identity } = await verify(google.sign({ email_verified: false }))
    expect(identity.email).toBeNull()
  })

  it('checks the nonce: as sent for Google, hashed for Apple', async () => {
    expect((await verify(google.sign({ nonce: 'n0nce-value' }), { nonce: 'n0nce-value' })).ok).toBe(true)
    expect(await verify(google.sign({ nonce: 'n0nce-value' }), { nonce: 'replayed-1' })).toEqual({ ok: false, reason: 'NonceMismatch' })

    const apple = provider('apple-1')
    const verifyApple = verifierFor(APPLE, jwksServer([apple.jwk]))
    const hashed = createHash('sha256').update('raw-nonce-1').digest('hex')
    const token = apple.sign({ nonce: hashed, email_verified: 'true' }, { issuer: 'https://appleid.apple.com' })
    expect(await verifyApple(token, { nonce: 'raw-nonce-1' })).toMatchObject({ ok: true, identity: { email: 'ana@example.com' } })
    expect(await verifyApple(token, { nonce: hashed })).toEqual({ ok: false, reason: 'NonceMismatch' })
  })
})

describe('signing key cache', () => {
  it('fetches keys once and reuses them while fresh', async () => {
    const google = provider()
    const server = jwksServer([google.jwk])
    const verify = verifierFor(GOOGLE, server)
    await verify(google.sign())
    await verify(google.sign())
    expect(server.requests).toBe(1)
  })

  it('picks up a rotated key, but refetches for unknown key ids at most once a minute', async () => {
    let clock = 0
    const oldKey = provider('old')
    const newKey = provider('new')
    const server = jwksServer([oldKey.jwk])
    const verify = verifierFor(GOOGLE, server, () => clock)

    expect((await verify(oldKey.sign())).ok).toBe(true)
    server.jwks = [oldKey.jwk, newKey.jwk]
    clock += 61000
    expect((await verify(newKey.sign())).ok).toBe(true)
    expect(server.requests).toBe(2)

    for (let i = 0; i < 5; i++) expect(await verify(provider('forged-' + i).sign({}, { keyid: 'forged-' + i }))).toEqual({ ok: false, reason: 'UnknownKey' })
    expect(server.requests).toBe(2)
  })

  it('keeps using cached keys if the provider is unreachable', async () => {
    let clock = 0
    const google = provider()
    const server = jwksServer([google.jwk], { maxAge: 60 })
    const verify = verifierFor(GOOGLE, server, () => clock)
    await verify(google.sign())
    server.failing = true
    clock += 120000
    expect((await verify(google.sign())).ok).toBe(true)
  })
})
