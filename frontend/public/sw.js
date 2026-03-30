const CACHE_NAME = 'sorveteria-pos-v7'
const ASSETS = ['/', '/index.html', '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)

  // Nunca cacheie API: evita status/caixa desatualizado.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request))
    return
  }

  // Para HTML/app shell, sempre tente rede primeiro para evitar interface antiga presa em cache.
  const isNavigationRequest = event.request.mode === 'navigate'
  const isAppShellRequest =
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    event.request.destination === 'document'

  if (isNavigationRequest || isAppShellRequest) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (!resp.ok) {
            return resp
          }
          const copy = resp.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy))
          return resp
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // Assets do app tambem tentam rede primeiro; cache fica como fallback offline.
  if (['script', 'style', 'worker'].includes(event.request.destination)) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (!resp.ok) {
            return resp
          }
          const copy = resp.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          return resp
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).then((resp) => {
        if (!resp.ok) {
          return resp
        }
        const copy = resp.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        return resp
      }).catch(() => cached)
    )
  )
})
