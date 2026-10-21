import { CLIENT_EVENTS, ERROR_CODES, ROULETTE_NAMESPACE, SERVER_EVENTS } from '@roulette/contracts'
import * as errorTypes from '~/utils/constants/errors'
import { ROULETTE_EVENTS, SOCKET_EMITTERS, SOCKET_NAMESPACES } from '~/utils/constants/socket'

// Clients are written against @roulette/contracts; these tests fail if the
// server's names or codes drift away from it.
describe('@roulette/contracts matches the server', () => {
  it('uses the same namespace and event names', () => {
    expect(SOCKET_NAMESPACES.ROULETTE).toBe(ROULETTE_NAMESPACE)
    expect(Object.values(ROULETTE_EVENTS).sort()).toEqual(Object.values(CLIENT_EVENTS).sort())
    const emitted = Object.entries(SOCKET_EMITTERS).filter(([key]) => key.startsWith('ROULETTE_')).map(([, name]) => name)
    expect(emitted.sort()).toEqual(Object.values(SERVER_EVENTS).sort())
  })

  it('knows every error code a client branches on', () => {
    const serverCodes = new Set(Object.values(errorTypes).map(type => type?.errorCode).filter(Boolean))
    for (const [name, code] of Object.entries(ERROR_CODES)) {
      expect([name, serverCodes.has(code)]).toEqual([name, true])
    }
  })
})
