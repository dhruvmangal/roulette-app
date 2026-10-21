/**
 * Clamp/parse pagination params coming from a request into safe { pageNo, size } values.
 */
export const pageValidation = (page, limit, maxSize = 200) => {
  const pageAsNumber = Number.parseInt(page, 10)
  const sizeAsNumber = Number.parseInt(limit, 10)
  let pageNo = 1
  let size = 15

  if (
    Number.isNaN(pageAsNumber) ||
    pageAsNumber < 0 ||
    Number.isNaN(sizeAsNumber) ||
    sizeAsNumber < 0 ||
    sizeAsNumber > maxSize
  ) {
    return { pageNo, size }
  }

  size = sizeAsNumber
  pageNo = pageAsNumber

  return { pageNo, size }
}

export const generateRandomNumber = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export const splitFullName = (name = '') => {
  const nameParts = name.trim().split(' ')
  const firstName = nameParts[0]
  const lastName = nameParts.slice(1).join(' ')
  return { firstName, lastName }
}

export const decimalFix = (number, decimalPlaces) => {
  const multiplier = 10 ** decimalPlaces
  return Math.floor(number * multiplier) / multiplier
}

/**
 * Best-effort client IP resolution, trusting common CDN/proxy headers before
 * falling back to the raw socket address. Make sure your proxy actually sets
 * (and your infra strips client-supplied) whichever header you rely on.
 */
export const getClientIp = (req) => {
  const headerCandidates = [
    'x-client-ip',
    'cf-connecting-ip',
    'fastly-client-ip',
    'true-client-ip',
    'x-real-ip'
  ]

  for (const header of headerCandidates) {
    const value = req.headers?.[header]
    if (value) return value
  }

  const forwardedFor = req.headers?.['x-forwarded-for']
  if (forwardedFor) return forwardedFor.split(',')[0].trim()

  return req.ip || req.socket?.remoteAddress
}
