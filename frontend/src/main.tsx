import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './app/router'
import './styles.css'

const root = document.getElementById('root')!
const CHUNK_RELOAD_KEY = 'sorveteria.chunk-reload-at'

const maybeRecoverFromChunkError = (reason: unknown) => {
  const message =
    typeof reason === 'string'
      ? reason
      : reason instanceof Error
        ? reason.message
        : String(reason ?? '')

  const isChunkError =
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed')

  if (!isChunkError) {
    return false
  }

  const lastReloadAt = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || '0')
  if (Date.now() - lastReloadAt < 10000) {
    return false
  }

  window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  window.location.reload()
  return true
}

window.addEventListener('error', (event) => {
  if (maybeRecoverFromChunkError(event.error ?? event.message)) {
    event.preventDefault()
  }
})

window.addEventListener('unhandledrejection', (event) => {
  if (maybeRecoverFromChunkError(event.reason)) {
    event.preventDefault()
  }
})

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
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
  })
}
