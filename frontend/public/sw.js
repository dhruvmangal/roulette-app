// Makes the site installable and quick to reopen. Built files never change under the same name,
// so they are kept and served from the device; pages are fetched fresh, with the last copy as the offline fallback.
// The API, sockets and everything on other origins (ads, sign-in) go straight to the network.
const VERSION = 'v1'
const STATIC = `static-${VERSION}`
const PAGES = `pages-${VERSION}`
const KEPT = /^\/(assets|fonts|cards|dealer|games|icons)\//

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter(name => name !== STATIC && name !== PAGES).map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(fetchPage(request))
  } else if (KEPT.test(url.pathname)) {
    event.respondWith(fetchKept(request))
  }
})

async function fetchPage (request) {
  const cache = await caches.open(PAGES)
  try {
    const response = await fetch(request)
    // Every address serves the same app shell (or its own SEO page); keep the last good copy.
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (error) {
    return (await cache.match(request)) ?? (await cache.match('/')) ?? Response.error()
  }
}

async function fetchKept (request) {
  const cache = await caches.open(STATIC)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok && response.status === 200) cache.put(request, response.clone())
  return response
}
