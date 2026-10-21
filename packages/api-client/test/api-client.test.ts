import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, createApiClient, memoryTokenStore } from '../src/index.ts'

interface Call { url: string, init: RequestInit }

/** A fetch that answers from a list of [status, body] replies and records each call. */
function fakeFetch (replies: Array<[number, unknown]>) {
  const calls: Call[] = []
  const fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init })
    const [status, body] = replies.shift() ?? [500, null]
    return new Response(JSON.stringify(body), { status })
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

const ok = (data: unknown) => [200, { data, errors: [] }] as [number, unknown]
const failed = (status: number, errorCode: number) => [status, { data: {}, errors: [{ name: 'X', description: 'nope', errorCode }] }] as [number, unknown]
const header = (call: Call, name: string) => (call.init.headers as Record<string, string>)[name]

test('signing in stores the tokens and later calls send them', async () => {
  const tokens = memoryTokenStore()
  const { fetch, calls } = fakeFetch([ok({ player: {}, tokens: { accessToken: 'a1', refreshToken: 'r1' } }), ok({ wallet: { balance: 1000 } })])
  const api = createApiClient({ baseUrl: 'http://x', tokens, fetch })

  await api.guest()
  const { wallet } = await api.wallet()

  assert.equal(wallet.balance, 1000)
  assert.equal(calls[1].url, 'http://x/api/v1/wallet')
  assert.equal(header(calls[1], 'Authorization'), 'Bearer a1')
})

test('an expired access token is refreshed once and the request retried', async () => {
  const tokens = memoryTokenStore({ accessToken: 'old', refreshToken: 'r1' })
  const { fetch, calls } = fakeFetch([failed(403, 1007), ok({ tokens: { accessToken: 'new', refreshToken: 'r2' } }), ok({ wallet: { balance: 5 } })])
  const api = createApiClient({ baseUrl: '', tokens, fetch })

  assert.equal((await api.wallet()).wallet.balance, 5)
  assert.equal(calls[1].url, '/api/v1/auth/refresh')
  assert.equal(header(calls[2], 'Authorization'), 'Bearer new')
  assert.deepEqual(tokens.get(), { accessToken: 'new', refreshToken: 'r2' })
})

test('a failed refresh signs the player out and surfaces the original error', async () => {
  const tokens = memoryTokenStore({ accessToken: 'old', refreshToken: 'bad' })
  const { fetch } = fakeFetch([failed(403, 1007), failed(401, 1205)])
  const api = createApiClient({ baseUrl: '', tokens, fetch })

  await assert.rejects(api.wallet(), (error: ApiError) => error.status === 403 && error.errorCode === 1007)
  assert.equal(tokens.get(), null)
})

test('business errors are not retried and carry the server error code', async () => {
  const tokens = memoryTokenStore({ accessToken: 'a', refreshToken: 'r' })
  const { fetch, calls } = fakeFetch([failed(400, 1401)])
  const api = createApiClient({ baseUrl: '', tokens, fetch })

  await assert.rejects(api.claimBonus('DAILY'), (error: ApiError) => error.errorCode === 1401)
  assert.equal(calls.length, 1)
})

test('a network failure becomes an ApiError with status 0', async () => {
  const api = createApiClient({ baseUrl: '', tokens: memoryTokenStore(), fetch: (async () => { throw new TypeError('offline') }) as typeof fetch })
  await assert.rejects(api.publicRooms(), (error: ApiError) => error.status === 0)
})

test('room codes are sent upper-case and query strings skip empty filters', async () => {
  const { fetch, calls } = fakeFetch([ok({}), ok({ transactions: { rows: [], count: 0 } })])
  const api = createApiClient({ baseUrl: '', tokens: memoryTokenStore({ accessToken: 'a', refreshToken: 'r' }), fetch })

  await api.joinRoom('ab12cd')
  await api.transactions({ type: 'WIN', limit: 10 })
  assert.equal(calls[0].init.body, JSON.stringify({ code: 'AB12CD' }))
  assert.equal(calls[1].url, '/api/v1/wallet/transactions?type=WIN&limit=10')
})

test('logout tells the server, then forgets the tokens even if the server is unreachable', async () => {
  const tokens = memoryTokenStore({ accessToken: 'a', refreshToken: 'r1' })
  const { fetch, calls } = fakeFetch([[500, null]])
  const api = createApiClient({ baseUrl: '', tokens, fetch })

  await api.logout()
  assert.equal(calls[0].url, '/api/v1/auth/logout')
  assert.equal(calls[0].init.body, JSON.stringify({ refreshToken: 'r1' }))
  assert.equal(tokens.get(), null)
})

test('signing in with Google posts the ID token and keeps the session', async () => {
  const tokens = memoryTokenStore()
  const { fetch, calls } = fakeFetch([ok({ player: {}, tokens: { accessToken: 'a', refreshToken: 'r' }, isNew: true })])
  const api = createApiClient({ baseUrl: '', tokens, fetch })

  const result = await api.signIn('google', { idToken: 'id-token', nonce: 'n0nce-123' })
  assert.equal(calls[0].url, '/api/v1/auth/google')
  assert.equal(calls[0].init.body, JSON.stringify({ idToken: 'id-token', nonce: 'n0nce-123' }))
  assert.equal(header(calls[0], 'Authorization'), undefined)
  assert.equal(result.isNew, true)
  assert.deepEqual(tokens.get(), { accessToken: 'a', refreshToken: 'r' })
})

test('a refresh that fails on the network keeps the session for later', async () => {
  const tokens = memoryTokenStore({ accessToken: 'old', refreshToken: 'r1' })
  const fetch = (async (url: string) => {
    if (String(url).endsWith('/auth/refresh')) throw new TypeError('offline')
    return new Response(JSON.stringify({ data: {}, errors: [{ name: 'X', description: 'expired', errorCode: 1007 }] }), { status: 403 })
  }) as typeof globalThis.fetch
  const api = createApiClient({ baseUrl: '', tokens, fetch })

  await assert.rejects(api.wallet())
  assert.deepEqual(tokens.get(), { accessToken: 'old', refreshToken: 'r1' })
})

test('a request that never answers times out as a network error', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fetch = ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal!.reason))
  })) as typeof globalThis.fetch
  const api = createApiClient({ baseUrl: '', tokens: memoryTokenStore(), fetch })
  const pending = api.providers()
  t.mock.timers.tick(10000)
  await assert.rejects(pending, (error: ApiError) => error.status === 0)
})
