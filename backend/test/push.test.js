import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { EventEmitter } from 'events'
import { classifyApnsError, createApnsClient, parseApnsKey } from '~/utils/apns.utils'
import { classifyFcmError, createFcmClient, parseServiceAccount } from '~/utils/fcm.utils'
import { PUSH_TYPES, pushText } from '~/utils/pushMessages.utils'
import { inQuietHours, localHour } from '~/utils/notification.utils'
import { PUSH_LANGUAGES } from '~/utils/constants/notification.constants'

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
})
const account = { client_email: 'push@roulette.iam.gserviceaccount.com', private_key: privateKey, project_id: 'roulette-demo' }

describe('reading the Firebase key', () => {
  it('accepts the JSON or the base64 of it, and nothing else', () => {
    const text = JSON.stringify(account)
    expect(parseServiceAccount(text).project_id).toBe('roulette-demo')
    expect(parseServiceAccount(Buffer.from(text).toString('base64')).client_email).toBe(account.client_email)
    for (const bad of ['', undefined, 'not json', '{"client_email":"x"}', Buffer.from('{}').toString('base64')]) expect(parseServiceAccount(bad)).toBeNull()
  })
})

describe('FCM errors', () => {
  it('knows when a phone token is dead', () => {
    expect(classifyFcmError(404, { error: { status: 'NOT_FOUND' } })).toBe('dead-token')
    expect(classifyFcmError(404, { error: { details: [{ errorCode: 'UNREGISTERED' }] } })).toBe('dead-token')
    expect(classifyFcmError(400, { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } })).toBe('dead-token')
    expect(classifyFcmError(400, { error: { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload' } })).toBe('rejected')
    expect(classifyFcmError(401, {})).toBe('auth')
    expect(classifyFcmError(503, {})).toBe('retry-later')
  })
})

describe('the FCM client', () => {
  const ok = (body) => ({ ok: true, status: 200, json: async () => body })

  it('signs in with a verifiable assertion, reuses the access token, and sends string-only data', async () => {
    const fetchImpl = jest.fn(async (url) => url.includes('oauth2') ? ok({ access_token: 'access-1' }) : ok({}))
    const now = 1_760_000_000_000
    const client = createFcmClient(account, { fetchImpl, now: () => now })

    expect(await client.send('token-a', { title: 'Hi', body: 'There', data: { n: 5, screen: 'friends' } })).toEqual({ ok: true })
    await client.send('token-b', { title: 'Hi', body: 'There' })

    const signIns = fetchImpl.mock.calls.filter(([url]) => url.includes('oauth2'))
    expect(signIns).toHaveLength(1)
    const assertion = new URLSearchParams(signIns[0][1].body).get('assertion')
    expect(jwt.verify(assertion, publicKey, { algorithms: ['RS256'], clockTimestamp: now / 1000 })).toMatchObject({
      iss: account.client_email, aud: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/firebase.messaging'
    })

    const [url, request] = fetchImpl.mock.calls.find(([address]) => address.includes('fcm.googleapis.com'))
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/roulette-demo/messages:send')
    expect(request.headers.authorization).toBe('Bearer access-1')
    expect(JSON.parse(request.body).message).toMatchObject({ token: 'token-a', notification: { title: 'Hi', body: 'There' }, data: { n: '5', screen: 'friends' } })
  })

  it('signs in again once the access token has expired', async () => {
    let now = 1_760_000_000_000
    const fetchImpl = jest.fn(async (url) => url.includes('oauth2') ? ok({ access_token: 'token' }) : ok({}))
    const client = createFcmClient(account, { fetchImpl, now: () => now })
    await client.send('a', { title: 't', body: 'b' })
    now += 3400 * 1000
    await client.send('a', { title: 't', body: 'b' })
    expect(fetchImpl.mock.calls.filter(([url]) => url.includes('oauth2'))).toHaveLength(2)
  })

  it('reports a dead token without throwing', async () => {
    const fetchImpl = jest.fn(async (url) => url.includes('oauth2')
      ? ok({ access_token: 'x' })
      : { ok: false, status: 404, json: async () => ({ error: { status: 'NOT_FOUND' } }) })
    const result = await createFcmClient(account, { fetchImpl }).send('gone', { title: 't', body: 'b' })
    expect(result).toEqual({ ok: false, reason: 'dead-token', status: 404 })
  })

  it('throws when Google refuses the sign-in', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) }))
    await expect(createFcmClient(account, { fetchImpl }).send('a', { title: 't', body: 'b' })).rejects.toThrow('FCM sign-in failed')
  })
})

describe('what notifications say', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()

  it('has every kind in every language with the same blanks to fill', () => {
    for (const type of Object.values(PUSH_TYPES)) {
      const english = pushText(type, 'en')
      for (const language of PUSH_LANGUAGES) {
        const text = pushText(type, language)
        expect([type, language, placeholders(text.title), placeholders(text.body)]).toEqual([type, language, placeholders(english.title), placeholders(english.body)])
        expect(text.title.length).toBeGreaterThan(3)
      }
    }
  })

  it('fills in names and amounts, and falls back to English', () => {
    expect(pushText(PUSH_TYPES.friendRequest, 'en', { name: 'ana' }).body).toBe('ana wants to be your friend.')
    expect(pushText(PUSH_TYPES.friendRequest, 'es', { name: 'ana' }).body).toBe('ana quiere ser tu amigo.')
    expect(pushText(PUSH_TYPES.friendRequest, 'de', { name: 'ana' })).toEqual(pushText(PUSH_TYPES.friendRequest, 'en', { name: 'ana' }))
    expect(() => pushText('nonsense', 'en')).toThrow()
  })
})

describe('quiet hours', () => {
  const night = { from: 22, to: 8 }
  it('wraps past midnight and treats an unknown timezone as awake', () => {
    expect([21, 22, 23, 0, 7, 8, 12].map(hour => inQuietHours(hour, night))).toEqual([false, true, true, true, true, false, false])
    expect(inQuietHours(null, night)).toBe(false)
  })

  it('reads the hour in a timezone', () => {
    const noonUtc = new Date('2026-10-20T12:00:00Z')
    expect(localHour('UTC', noonUtc)).toBe(12)
    expect(localHour('Asia/Kolkata', noonUtc)).toBe(17)
    expect(localHour('Mars/Olympus', noonUtc)).toBeNull()
  })
})

describe('the Apple push client', () => {
  const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
  const config = { key: ec.privateKey, keyId: 'ABC123DEFG', teamId: 'TEAM123456', topic: 'com.roulette.game' }

  /** A stand-in for Apple's HTTP/2 connection that answers each request with the next canned response. */
  const fakeApple = (responses) => {
    const requests = []
    const connect = jest.fn((host) => {
      const session = new EventEmitter()
      session.host = host
      session.closed = false
      session.close = () => { session.closed = true }
      session.request = (headers) => {
        const stream = new EventEmitter()
        stream.setEncoding = () => {}
        stream.setTimeout = () => {}
        stream.close = () => {}
        stream.end = (body) => {
          requests.push({ headers, body: JSON.parse(body) })
          const answer = responses.shift() ?? { status: 200 }
          setImmediate(() => {
            stream.emit('response', { ':status': answer.status })
            if (answer.body) stream.emit('data', answer.body)
            stream.emit('end')
          })
        }
        return stream
      }
      return session
    })
    return { connect, requests }
  }

  it('reads the key from its text or the base64 of it, and nothing else', () => {
    expect(parseApnsKey(ec.privateKey)).toBe(ec.privateKey.trim())
    expect(parseApnsKey(Buffer.from(ec.privateKey).toString('base64'))).toContain('BEGIN PRIVATE KEY')
    for (const bad of ['', undefined, 'not a key', Buffer.from('nope').toString('base64')]) expect(parseApnsKey(bad)).toBeNull()
  })

  it('knows when a token is dead', () => {
    expect(classifyApnsError(410, 'Unregistered')).toBe('dead-token')
    expect(classifyApnsError(400, 'BadDeviceToken')).toBe('dead-token')
    expect(classifyApnsError(403, 'ExpiredProviderToken')).toBe('auth')
    expect(classifyApnsError(429, 'TooManyRequests')).toBe('retry-later')
    expect(classifyApnsError(400, 'PayloadEmpty')).toBe('rejected')
  })

  it('signs in with a verifiable token, reuses it and the connection, and sends the alert with its data', async () => {
    const apple = fakeApple([{ status: 200 }, { status: 200 }])
    const now = 1_760_000_000_000
    const client = createApnsClient({ ...config, production: false }, { connect: apple.connect, now: () => now })

    expect(await client.send('device-one', { title: 'Hi', body: 'There', data: { screen: 'friends' } })).toEqual({ ok: true })
    await client.send('device-two', { title: 'Hi', body: 'There' })

    expect(apple.connect).toHaveBeenCalledTimes(1)
    expect(apple.connect).toHaveBeenCalledWith('https://api.sandbox.push.apple.com')
    const [first, second] = apple.requests
    expect(first.headers).toMatchObject({ ':method': 'POST', ':path': '/3/device/device-one', 'apns-topic': 'com.roulette.game', 'apns-push-type': 'alert' })
    expect(first.body).toEqual({ aps: { alert: { title: 'Hi', body: 'There' }, sound: 'default' }, screen: 'friends' })
    expect(second.headers.authorization).toBe(first.headers.authorization)
    const token = first.headers.authorization.replace('bearer ', '')
    expect(jwt.decode(token, { complete: true }).header).toMatchObject({ alg: 'ES256', kid: 'ABC123DEFG' })
    expect(jwt.verify(token, ec.publicKey, { algorithms: ['ES256'], clockTimestamp: now / 1000 })).toMatchObject({ iss: 'TEAM123456' })
  })

  it('uses the production server for App Store builds', async () => {
    const apple = fakeApple([{ status: 200 }])
    await createApnsClient({ ...config, production: true }, { connect: apple.connect }).send('d', { title: 't', body: 'b' })
    expect(apple.connect).toHaveBeenCalledWith('https://api.push.apple.com')
  })

  it('reports why Apple refused', async () => {
    const apple = fakeApple([{ status: 410, body: '{"reason":"Unregistered"}' }, { status: 400, body: '{"reason":"PayloadEmpty"}' }, { status: 503 }])
    const client = createApnsClient(config, { connect: apple.connect })
    expect(await client.send('a', { title: 't', body: 'b' })).toEqual({ ok: false, reason: 'dead-token', status: 410 })
    expect(await client.send('a', { title: 't', body: 'b' })).toEqual({ ok: false, reason: 'rejected', status: 400 })
    expect(await client.send('a', { title: 't', body: 'b' })).toEqual({ ok: false, reason: 'retry-later', status: 503 })
  })

  it('reconnects after the connection drops', async () => {
    const apple = fakeApple([{ status: 200 }, { status: 200 }])
    const client = createApnsClient(config, { connect: apple.connect })
    await client.send('a', { title: 't', body: 'b' })
    apple.connect.mock.results[0].value.emit('close')
    await client.send('a', { title: 't', body: 'b' })
    expect(apple.connect).toHaveBeenCalledTimes(2)
  })
})
