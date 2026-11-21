/* LeLije service worker: offline shell plus pose model and wasm caching. */
const CACHE = 'lelije-v1'
const ASSETS = /^\/(models|wasm)\//

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (error) {
    const hit =
      (await cache.match(request)) ??
      (request.mode === 'navigate' ? await cache.match('/') : undefined)
    if (hit) return hit
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  // API calls are never cached: points and missions come from the server.
  if (url.pathname.startsWith('/api/')) return
  event.respondWith(ASSETS.test(url.pathname) ? cacheFirst(request) : networkFirst(request))
})
