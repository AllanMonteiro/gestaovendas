const CACHE_NAME = 'sorveteria-pos-v9'
const ASSETS = ['/', '/index.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png']

const extractAssetUrls = (html) => {
  const assetUrls = new Set()
  const matches = html.matchAll(/(?:src|href)=["'](\/[^"'?#]+\.(?:js|css|ico|png|svg|webmanifest))["']/gi)
  for (const match of matches) {
    if (match[1]) {
      assetUrls.add(match[1])
    }
  }
  return [...assetUrls]
}

const isCacheableProtocol = (requestUrl) => {
  try {
    const { protocol } = new URL(requestUrl)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      let dynamicAssets = []
      try {
        const indexResponse = await fetch('/index.html', { cache: 'reload' })
        if (indexResponse.ok) {
          const html = await indexResponse.text()
          dynamicAssets = extractAssetUrls(html)
          await cache.put('/index.html', new Response(html, { headers: { 'Content-Type': 'text/html' } }))
        }
      } catch {
        // Se a rede falhar no install, seguimos com o shell minimo ja conhecido.
      }
      await cache.addAll([...new Set([...ASSETS, ...dynamicAssets])])
    })()
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
  if (!isCacheableProtocol(event.request.url)) return
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
        .catch(async () => {
          const cached = await caches.match('/index.html')
          return (
            cached ||
            new Response('Offline', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          )
        })
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
        .catch(async () => {
          const cached = await caches.match(event.request)
          return (
            cached ||
            new Response('', {
              status: 504,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          )
        })
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached ||
      fetch(event.request)
        .then((resp) => {
          if (!resp.ok) {
            return resp
          }
          const copy = resp.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          return resp
        })
        .catch(
          () =>
            cached ||
            new Response('', {
              status: 504,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
        )
    )
  )
})
