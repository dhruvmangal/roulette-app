import { signAccessToken } from '~/utils/auth.utils'
import {
  LogoutEverywhereService, LogoutService, RefreshTokenService, StartSessionService
} from '~/services/player'
import { fakeSessions } from './helpers/fakeSessions'

const errorKeys = (service) => Object.values(service.errors).flatMap(errors => Object.keys(errors))

describe('player sessions', () => {
  let db
  const login = async (playerId = 1) => (await StartSessionService.execute({ playerId, tokenVersion: db.players.get(playerId).tokenVersion }, db.context)).result.tokens
  const refresh = (refreshToken) => RefreshTokenService.execute({ refreshToken }, db.context)

  beforeEach(() => {
    db = fakeSessions()
    db.addPlayer({ playerId: 1, username: 'ana' })
  })

  it('stores only a hash of the refresh token', async () => {
    const { refreshToken } = await login()
    expect(db.sessions).toHaveLength(1)
    expect(JSON.stringify(db.sessions)).not.toContain(refreshToken.split('.')[1])
    expect(db.sessions[0].tokenHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rotates: a refresh retires the old token and continues the family', async () => {
    const first = await login()
    const rotated = await refresh(first.refreshToken)

    expect(rotated.successful).toBe(true)
    expect(rotated.result.tokens.refreshToken).not.toBe(first.refreshToken)
    const [old, next] = db.sessions
    expect(old.revokedAt).toBeInstanceOf(Date)
    expect(old.replacedBySessionId).toBe(next.playerSessionId)
    expect(next.familyId).toBe(old.familyId)
    expect(next.revokedAt).toBeNull()
  })

  it('treats an old token used again as stolen and revokes the whole family', async () => {
    const first = await login()
    const rotated = await refresh(first.refreshToken)
    db.sessions[0].revokedAt = new Date(Date.now() - 60000)

    const replay = await refresh(first.refreshToken)
    expect(errorKeys(replay)).toEqual(['InvalidRefreshTokenErrorType'])
    expect(db.sessions.every(session => session.revokedAt)).toBe(true)
    expect(errorKeys(await refresh(rotated.result.tokens.refreshToken))).toEqual(['InvalidRefreshTokenErrorType'])
  })

  it('refuses but forgives a reuse within seconds, as when two tabs refresh at once', async () => {
    const first = await login()
    const rotated = await refresh(first.refreshToken)

    expect(errorKeys(await refresh(first.refreshToken))).toEqual(['InvalidRefreshTokenErrorType'])
    expect((await refresh(rotated.result.tokens.refreshToken)).successful).toBe(true)
  })

  it('only accepts tokens signed with the refresh secret', async () => {
    const forged = signAccessToken({ playerId: 1, tokenVersion: 0, type: 'refresh', sid: 'x' })
    expect(errorKeys(await refresh(forged))).toEqual(['InvalidRefreshTokenErrorType'])
  })

  it('logout ends that login only', async () => {
    const phone = await login()
    const laptop = await login()
    const out = await LogoutService.execute({ refreshToken: phone.refreshToken }, db.context)

    expect(out.result.loggedOut).toBe(true)
    expect(errorKeys(await refresh(phone.refreshToken))).toEqual(['InvalidRefreshTokenErrorType'])
    expect((await refresh(laptop.refreshToken)).successful).toBe(true)
  })

  it('logout succeeds even with a junk token', async () => {
    expect((await LogoutService.execute({ refreshToken: 'junk' }, db.context)).successful).toBe(true)
  })

  it('logging out everywhere revokes every session and voids access tokens', async () => {
    const phone = await login()
    const laptop = await login()
    await LogoutEverywhereService.execute({ playerId: 1 }, db.context)

    expect(db.players.get(1).tokenVersion).toBe(1)
    expect(db.sessions.every(session => session.revokedAt)).toBe(true)
    for (const tokens of [phone, laptop]) expect((await refresh(tokens.refreshToken)).successful).toBe(false)
  })

  it('refuses banned players', async () => {
    const tokens = await login()
    db.players.get(1).status = 'banned'
    expect(errorKeys(await refresh(tokens.refreshToken))).toEqual(['PlayerBannedErrorType'])
  })
})
