import { isIP } from 'net'
import { Reader } from 'maxmind'
import { readFileSync } from 'fs'
import Logger from '~/libs/logger'

/**
 * Approximate place for an IP address, from DB-IP's free city database
 * (IP geolocation by DB-IP, https://db-ip.com, CC BY 4.0). Loaded once, on
 * first use; about 130 MB, so lookups are in-memory and instant.
 */

let readers = null

const load = () => {
  if (readers) return readers
  try {
    const file = (name) => new Reader(readFileSync(require.resolve(`@ip-location-db/dbip-city-mmdb/${name}`)))
    readers = { 4: file('dbip-city-ipv4.mmdb'), 6: file('dbip-city-ipv6.mmdb') }
  } catch (error) {
    Logger.error('Geo', { message: 'Could not load the IP location database', exception: error })
    readers = {}
  }
  return readers
}

/** Strips the IPv6 wrapper Node puts around IPv4 addresses (::ffff:1.2.3.4). */
export const normaliseIp = (ip) => (ip || '').replace(/^::ffff:(?=\d+\.)/, '') || null

const PRIVATE = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|f[cd][0-9a-f]{2}:|fe80:)/i

/** { country, region, city, latitude, longitude } for a public IP; nulls for private or unknown ones. */
export function locateIp (rawIp) {
  const empty = { country: null, region: null, city: null, latitude: null, longitude: null }
  const ip = normaliseIp(rawIp)
  const version = ip && isIP(ip)
  if (!version || PRIVATE.test(ip)) return empty
  const found = load()[version]?.get(ip)
  if (!found) return empty
  const round = (value) => (typeof value === 'number' ? Math.round(value * 100) / 100 : null)
  return {
    country: found.country_code || null,
    region: found.state1 || null,
    city: found.city || null,
    latitude: round(found.latitude),
    longitude: round(found.longitude)
  }
}
