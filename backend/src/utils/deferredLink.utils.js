// Link-preview robots (WhatsApp, Telegram, iMessage, search engines...) fetch a shared link
// without anyone tapping it. They must not count as a person about to install the app.
const BOT = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|embedly|skype|vkshare|pinterest|applebot|curl|wget|python-requests|go-http-client|okhttp\/.*retrofit/i

export const isPreviewBot = (userAgent) => !userAgent || BOT.test(userAgent)

/** 'ios' or 'android' for a phone's browser, null for anything else (desktop, unknown). */
export const detectPlatform = (userAgent) => {
  const agent = String(userAgent || '')
  if (/iPhone|iPad|iPod/i.test(agent)) return 'ios'
  if (/Android/i.test(agent)) return 'android'
  return null
}

// A tapped link is remembered this long.
export const DEFERRED_LINK_TTL_MS = 24 * 60 * 60 * 1000
