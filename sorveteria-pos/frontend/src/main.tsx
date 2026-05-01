import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { isIgnorableExternalRejection, maybeRecoverFromChunkError } from './app/errorHandling'
import { AppProviders } from './app/providers'
import { router } from './app/router'
import './styles.css'

const root = document.getElementById('root')!
const bypassServiceWorker =
  typeof window !== 'undefined' &&
  Boolean((window as Window & { __SORVETERIA_BYPASS_SW__?: boolean }).__SORVETERIA_BYPASS_SW__)

const isPublicMenuRoute = () => window.location.pathname.startsWith('/cardapio')

const isEmbeddedSocialBrowser = () => {
  const userAgent = window.navigator.userAgent || ''
  return /Instagram|FBAN|FBAV|FB_IAB|FB4A|TikTok|Line\/|MicroMessenger/i.test(userAgent)
}

const preloadOfflineRoutes = () => {
  if (!window.navigator.onLine) {
    return
  }

  const preloadRoute = async (loader: () => Promise<unknown>) => {
    try {
      await loader()
    } catch {
      // Route warm-up is opportunistic and should never surface as a user-facing error.
    }
  }

  const warmUp = () => {
    // Keep first navigation snappy for the core operational screens without eagerly loading heavy secondary pages.
    void Promise.allSettled([
      preloadRoute(() => import('./pages/PDV')),
      preloadRoute(() => import('./pages/Caixa')),
      preloadRoute(() => import('./pages/Cozinha')),
      preloadRoute(() => import('./pages/Produtos')),
      preloadRoute(() => import('./pages/Configuracoes')),
    ])
  }

  if ('requestIdleCallback' in window) {
    ;(window as Window & { requestIdleCallback: (callback: () => void) => number }).requestIdleCallback(warmUp)
    return
  }
  setTimeout(warmUp, 1500)
}

window.addEventListener('error', (event) => {
  if (maybeRecoverFromChunkError(event.error ?? event.message)) {
    event.preventDefault()
  }
})

window.addEventListener('unhandledrejection', (event) => {
  if (isIgnorableExternalRejection(event.reason)) {
    event.preventDefault()
    return
  }

  if (maybeRecoverFromChunkError(event.reason)) {
    event.preventDefault()
  }
})

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (bypassServiceWorker || isPublicMenuRoute() || isEmbeddedSocialBrowser()) {
      return
    }

    let refreshing = false

    const requestImmediateActivation = (worker: ServiceWorker | null) => {
      worker?.postMessage({ type: 'SKIP_WAITING' })
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) {
        return
      }
      refreshing = true
      window.location.reload()
    })

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      if (registration.waiting) {
        requestImmediateActivation(registration.waiting)
      }

      registration.addEventListener('updatefound', () => {
        const nextWorker = registration.installing
        if (!nextWorker) {
          return
        }
        nextWorker.addEventListener('statechange', () => {
          if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
            requestImmediateActivation(nextWorker)
          }
        })
      })

      void registration.update()
    }).catch(() => undefined)

    preloadOfflineRoutes()
  })
}
