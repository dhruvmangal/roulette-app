import { ROULETTE_NAMESPACE } from '@roulette/contracts'
import { io, type Socket } from 'socket.io-client'

/**
 * Opens the /roulette socket. The token is read on every (re)connect, so a refreshed access token
 * is picked up automatically after a dropped connection.
 */
export function connectRoulette ({ baseUrl, getAccessToken }: { baseUrl: string, getAccessToken: () => string | null }): Socket {
  return io(`${baseUrl}${ROULETTE_NAMESPACE}`, {
    auth: (send) => send({ token: getAccessToken() }),
    transports: ['websocket']
  })
}
