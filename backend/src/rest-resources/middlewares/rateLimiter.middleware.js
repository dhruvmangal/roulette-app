import rateLimit from 'express-rate-limit'
import { RedisStore } from 'rate-limit-redis'
import redisClient from '~/libs/redisClient'
import config from '~/configs/app.config'

/**
 * Rate limiter factory.
 *
 * Defaults to an in-memory store — resilient and zero-config for local dev
 * (per-process only, resets on restart). Pass `distributed: true` (or run
 * with NODE_ENV=production) to back it with Redis instead, so the limit is
 * shared across every instance of the app behind your load balancer.
 *
 * Note: if you opt into the Redis-backed store, a Redis outage will queue
 * (not fail) commands by default under ioredis's offline queue — make sure
 * your Redis is actually reachable in any environment where you enable it.
 *
 * @example
 * router.post('/otp', rateLimiter({ max: 5 }), OtpController.send)
 */
let limiterCount = 0

export default function rateLimiter ({
  windowMinutes = config.get('rate_limit_opt_timewindow'),
  max = config.get('rate_limit_opt_max_requests'),
  message = 'Too many requests, please try again later.',
  distributed = config.get('env') === 'production'
} = {}) {
  const options = {
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { data: {}, errors: [{ name: 'RateLimited', description: message }] }
  }

  if (distributed) {
    // Each limiter needs its own key prefix, or they all share one counter per IP.
    options.store = new RedisStore({
      prefix: `rl:${limiterCount++}:`,
      sendCommand: (...args) => redisClient.client.call(...args)
    })
  }

  return rateLimit(options)
}
