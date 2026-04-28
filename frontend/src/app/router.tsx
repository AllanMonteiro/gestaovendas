import React, { useCallback, useEffect, useRef, useState, Suspense, lazy } from 'react'
import { Navigate, createBrowserRouter, NavLink, Outlet, useLocation, useNavigate, useRouteError } from 'react-router-dom'
import { useOutboxSync } from './useSync'
import { api } from '../api/client'
import { getAccessToken, getRefreshToken, type AuthSession } from './auth'
import { playNotificationSound, prepareNotificationSound, stopRepeatingDeliveryAlarm, syncRepeatingDeliveryAlarm } from './playNotificationSound'
import { resolveAssetUrl } from './runtime'
import { LoginGate } from '../components/LoginGate'
import { LoadingState } from '../components/ui'
import { useSocket } from '../hooks/useSocket'
const PublicMenu = lazy(() => import('../pages/PublicMenu'))

// Lazy loading das paginas para reduzir o bundle inicial
const PDV = lazy(() => import('../pages/PDV'))
const Caixa = lazy(() => import('../pages/Caixa'))
const Cozinha = lazy(() => import('../pages/Cozinha'))
const Produtos = lazy(() => import('../pages/Produtos'))
const Configuracoes = lazy(() => import('../pages/Configuracoes'))
const Fidelidade = lazy(() => import('../pages/Fidelidade'))
const Relatorios = lazy(() => import('../pages/Relatorios'))
const PedidosDelivery = lazy(() => import('../pages/PedidosDelivery'))

type StoreHeaderConfig = {
  store_name?: string
  logo_url?: string | null
  theme?: string
}

type BrandingDetail = {
  store_name?: string
  logo_url?: string | null
}

type DeliveryAlert = {
  id: string
  customer_name?: string
  total?: string
}

type DeliveryOrderPayload = DeliveryAlert & {
  created_at?: string
  status?: string
}

type DeliveryOrdersResponse = DeliveryOrderPayload[] | { results?: DeliveryOrderPayload[] } | { data?: DeliveryOrderPayload[] }

const CHUNK_RELOAD_KEY = 'sorveteria.chunk-reload-at'
const BRANDING_CACHE_KEY = 'sorveteria.branding-cache'
const DELIVERY_ALERT_POLL_INTERVAL_MS = 10000
const DELIVERY_ALERT_REFRESH_DEBOUNCE_MS = 150

const normalizeTheme = (value?: string | null) => {
  if (!value || value === 'light') return 'cream'
  if (value === 'green' || value === 'blue' || value === 'cream') return value
  return 'cream'
}

const readBrandingCache = () => {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(BRANDING_CACHE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as StoreHeaderConfig
    return {
      store_name: parsed.store_name || 'Sorveteria POS',
      logo_url: parsed.logo_url || '',
      theme: normalizeTheme(parsed.theme),
    }
  } catch {
    return null
  }
}

const writeBrandingCache = (branding: StoreHeaderConfig) => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(
      BRANDING_CACHE_KEY,
      JSON.stringify({
        store_name: branding.store_name || 'Sorveteria POS',
        logo_url: branding.logo_url || '',
        theme: normalizeTheme(branding.theme),
      })
    )
  } catch {
    // Ignore storage failures and keep runtime state only.
  }
}

const isChunkLoadError = (error: unknown) => {
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: unknown }).message ?? '')
          : String(error ?? '')
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed')
  )
}

const tryRecoverChunk = () => {
  const lastReloadAt = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || '0')
  if (Date.now() - lastReloadAt < 10000) {
    return false
  }
  window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  window.location.reload()
  return true
}

const isEmbeddedSocialBrowser = () => {
  if (typeof window === 'undefined') {
    return false
  }
  const userAgent = window.navigator.userAgent || ''
  return /Instagram|FBAN|FBAV|FB_IAB|FB4A|TikTok|Line\/|MicroMessenger/i.test(userAgent)
}

const RootEntryRedirect: React.FC = () => {
  const hasStoredSession = Boolean(getAccessToken() || getRefreshToken())

  if (hasStoredSession) {
    return <Navigate to="/caixa" replace />
  }

  if (isEmbeddedSocialBrowser()) {
    return <Navigate to="/cardapio" replace />
  }

  return <Navigate to="/entrar" replace />
}

const NavLoading: React.FC = () => (
  <div className="rounded-2xl border border-slate-100 bg-white/80 p-6">
    <LoadingState
      title="Carregando modulo"
      description="Estamos buscando a proxima tela do sistema."
    />
  </div>
)

const normalizeDeliveryOrders = (payload: DeliveryOrdersResponse): DeliveryOrderPayload[] => {
  if (Array.isArray(payload)) {
    return payload
  }
  if (payload && !Array.isArray(payload) && 'results' in payload && Array.isArray(payload.results)) {
    return payload.results
  }
  if (payload && !Array.isArray(payload) && 'data' in payload && Array.isArray(payload.data)) {
    return payload.data
  }
  return []
}

const resolveNextBrandingLogo = (incoming: string | null | undefined, fallback: string) => {
  if (incoming === undefined) {
    return fallback
  }
  return incoming || ''
}

const RouteErrorBoundary: React.FC = () => {
  const error = useRouteError()

  useEffect(() => {
    if (isChunkLoadError(error)) {
      tryRecoverChunk()
    }
  }, [error])

  const chunkError = isChunkLoadError(error)
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'statusText' in error
        ? String((error as { statusText?: unknown }).statusText ?? 'Erro inesperado')
        : 'Erro inesperado'

  return (
    <div className="panel mx-auto max-w-2xl p-6 text-center">
      <h2 className="text-xl font-semibold text-brand-700">
        {chunkError ? 'Atualizando modulo do sistema...' : 'Erro ao carregar a tela'}
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        {chunkError
          ? 'Uma nova versao foi publicada. Vamos recarregar a pagina para sincronizar os arquivos.'
          : message}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
      >
        Recarregar pagina
      </button>
    </div>
  )
}

const Layout: React.FC = () => {
  useOutboxSync()
  const location = useLocation()
  const navigate = useNavigate()
  const cachedBranding = readBrandingCache()

  const [storeName, setStoreName] = useState(cachedBranding?.store_name || 'Sorveteria POS')
  const [logoUrl, setLogoUrl] = useState(cachedBranding?.logo_url || '')
  const [theme, setTheme] = useState<string>(cachedBranding?.theme || 'cream')
  const [currentUserName, setCurrentUserName] = useState('')
  const [deliveryAlerts, setDeliveryAlerts] = useState<DeliveryAlert[]>([])
  const knownDeliveryOrderIdsRef = useRef<Set<string>>(new Set())
  const deliveryPollTimerRef = useRef<number | null>(null)
  const deliveryRefreshTimerRef = useRef<number | null>(null)
  const deliveryAlertTimeoutsRef = useRef<Record<string, number>>({})
  const fetchDeliveryOrdersRef = useRef<(options?: { notifyOnNew?: boolean }) => void>(() => undefined)

  const links = [
    { to: '/caixa', label: 'Caixa' },
    { to: '/pdv', label: 'PDV' },
    { to: '/cozinha', label: 'Cozinha' },
    { to: '/produtos', label: 'Produtos' },
    { to: '/configuracoes', label: 'Configuracoes' },
    { to: '/fidelidade', label: 'Fidelidade' },
    { to: '/relatorios', label: 'Relatorios' },
    { to: '/delivery', label: 'Delivery' }
  ]

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [configResponse, sessionResponse] = await Promise.all([
          api.get<StoreHeaderConfig>('/api/config/ui'),
          api.get<AuthSession>('/api/auth/session').catch(() => ({ data: null as AuthSession | null }))
        ])
        setStoreName(configResponse.data.store_name || 'Sorveteria POS')
        setLogoUrl(configResponse.data.logo_url || '')
        setTheme(normalizeTheme(configResponse.data.theme))
        writeBrandingCache(configResponse.data)
        setCurrentUserName(sessionResponse.data?.user?.name || sessionResponse.data?.user?.email || '')
      } catch {
        const fallbackBranding = readBrandingCache()
        setStoreName(fallbackBranding?.store_name || 'Sorveteria POS')
        setLogoUrl(fallbackBranding?.logo_url || '')
        setTheme(fallbackBranding?.theme || 'cream')
        setCurrentUserName('')
      }
    }
    void loadConfig()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    writeBrandingCache({ store_name: storeName, logo_url: logoUrl, theme })
  }, [logoUrl, storeName, theme])

  useEffect(() => {
    prepareNotificationSound()
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<string>
      const nextTheme = normalizeTheme(custom.detail)
      setTheme(nextTheme)
      writeBrandingCache({ store_name: storeName, logo_url: logoUrl, theme: nextTheme })
    }
    window.addEventListener('sorveteria:theme', handler as EventListener)
    return () => window.removeEventListener('sorveteria:theme', handler as EventListener)
  }, [logoUrl, storeName])

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<BrandingDetail>
      const nextStoreName = custom.detail?.store_name || 'Sorveteria POS'
      const nextLogoUrl = resolveNextBrandingLogo(custom.detail?.logo_url, logoUrl)
      setStoreName(nextStoreName)
      setLogoUrl(nextLogoUrl)
      writeBrandingCache({ store_name: nextStoreName, logo_url: nextLogoUrl, theme })
    }
    window.addEventListener('sorveteria:branding', handler as EventListener)
    return () => window.removeEventListener('sorveteria:branding', handler as EventListener)
  }, [logoUrl, theme])

  useEffect(() => {
    const handler = () => {
      setCurrentUserName('')
    }
    window.addEventListener('sorveteria:logout', handler)
    return () => window.removeEventListener('sorveteria:logout', handler)
  }, [])

  useEffect(() => {
    if (location.pathname === '/delivery') {
      setDeliveryAlerts([])
      stopRepeatingDeliveryAlarm()
      return
    }

    const clearAlertTimeout = (id: string) => {
      const timeoutId = deliveryAlertTimeoutsRef.current[id]
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
        delete deliveryAlertTimeoutsRef.current[id]
      }
    }

    const playDeliveryAlertSound = () => {
      playNotificationSound()
    }

    const pushDeliveryAlerts = (orders: DeliveryOrderPayload[]) => {
      if (!orders.length) {
        return
      }
      playDeliveryAlertSound()
      setDeliveryAlerts((current) => {
        const next = [...current]
        for (const order of orders) {
          clearAlertTimeout(order.id)
          next.unshift({
            id: order.id,
            customer_name: order.customer_name || 'Novo pedido delivery',
            total: order.total,
          })
          deliveryAlertTimeoutsRef.current[order.id] = window.setTimeout(() => {
            setDeliveryAlerts((items) => items.filter((item) => item.id !== order.id))
            delete deliveryAlertTimeoutsRef.current[order.id]
          }, 15000)
        }
        return next.filter((alert, index, source) => source.findIndex((item) => item.id === alert.id) === index).slice(0, 3)
      })
    }

    const fetchDeliveryOrders = async (options?: { notifyOnNew?: boolean }) => {
      try {
        const response = await api.get<DeliveryOrdersResponse>('/api/orders/?include_items=0&limit=20')
        const nextOrders = normalizeDeliveryOrders(response.data)
        syncRepeatingDeliveryAlarm(nextOrders.some((order) => order.status === 'novo'))
        if (options?.notifyOnNew) {
          const newOrders = nextOrders.filter((order) => !knownDeliveryOrderIdsRef.current.has(order.id))
          if (newOrders.length) {
            const ordered = [...newOrders].sort((a, b) => {
              const left = a.created_at ? new Date(a.created_at).getTime() : 0
              const right = b.created_at ? new Date(b.created_at).getTime() : 0
              return left - right
            })
            pushDeliveryAlerts(ordered)
          }
        }
        knownDeliveryOrderIdsRef.current = new Set(nextOrders.map((order) => order.id))
      } catch {
        // Silently ignore; some roles may not have delivery access.
      }
    }

    fetchDeliveryOrdersRef.current = (options) => {
      void fetchDeliveryOrders(options)
    }

    void fetchDeliveryOrders()

    deliveryPollTimerRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void fetchDeliveryOrders({ notifyOnNew: true })
      }
    }, DELIVERY_ALERT_POLL_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void fetchDeliveryOrders({ notifyOnNew: true })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      fetchDeliveryOrdersRef.current = () => undefined
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (deliveryPollTimerRef.current !== null) {
        window.clearInterval(deliveryPollTimerRef.current)
      }
      if (deliveryRefreshTimerRef.current !== null) {
        window.clearTimeout(deliveryRefreshTimerRef.current)
      }
      Object.keys(deliveryAlertTimeoutsRef.current).forEach(clearAlertTimeout)
      stopRepeatingDeliveryAlarm()
    }
  }, [location.pathname])

  const handlePdvRealtimeMessage = useCallback((data: unknown) => {
    if (location.pathname === '/delivery' || document.visibilityState !== 'visible') {
      return
    }

    if (
      typeof data === 'object' &&
      data !== null &&
      'event' in data &&
      'source' in data &&
      (data as { event?: unknown }).event === 'order_created' &&
      (data as { source?: unknown }).source === 'delivery'
    ) {
      if (deliveryRefreshTimerRef.current !== null) {
        window.clearTimeout(deliveryRefreshTimerRef.current)
      }
      deliveryRefreshTimerRef.current = window.setTimeout(() => {
        if (document.visibilityState !== 'visible' || !navigator.onLine) {
          return
        }
        fetchDeliveryOrdersRef.current({ notifyOnNew: true })
      }, DELIVERY_ALERT_REFRESH_DEBOUNCE_MS)
    }
  }, [location.pathname])

  useSocket('/ws/pdv', {
    enabled: location.pathname !== '/delivery',
    onMessage: handlePdvRealtimeMessage,
  })

  return (
    <div className="app-shell">
      <header className="sticky top-0 z-20 border-b border-white/50 bg-white/68 backdrop-blur-xl">
        <div className="mx-auto max-w-[1500px] px-3 py-3 sm:px-4 md:px-6 md:py-4">
          <div className="rounded-[1.75rem] border border-white/70 bg-white/72 px-4 py-4 shadow-sm shadow-slate-200/60 backdrop-blur-xl sm:px-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start justify-between gap-3 sm:items-center">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.35rem] border border-brand-100/80 bg-white shadow-sm sm:h-[4.5rem] sm:w-[4.5rem]">
                  {logoUrl ? (
                    <img
                      src={resolveAssetUrl(logoUrl)}
                      alt={`Logo de ${storeName}`}
                      className="h-full w-full object-cover"
                      onError={() => setLogoUrl('')}
                    />
                  ) : (
                    <span className="text-lg font-bold uppercase tracking-[0.18em] text-brand-700">
                      {(storeName || 'SP').slice(0, 2)}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-600/80">Sorveteria POS</p>
                  <h1 className="truncate text-xl font-display tracking-[0.02em] text-slate-900 sm:text-2xl lg:text-[2rem]">{storeName}</h1>
                  <p className="text-xs text-slate-500 sm:text-sm">Operacao local enxuta, offline-first e pronta para delivery.</p>
                </div>
              </div>
              <span className="badge-live shrink-0">Online</span>
            </div>
              <div className="flex flex-col gap-3">
                <nav className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) =>
                      `shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium transition sm:px-4 sm:py-2.5 ${
                        isActive
                          ? 'rounded-full bg-slate-900 text-white shadow-sm shadow-slate-300'
                          : 'rounded-full border border-slate-200/80 bg-white/70 text-slate-700 hover:border-brand-300 hover:text-brand-700'
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
                </nav>
                {currentUserName ? (
                  <div className="flex items-center justify-end gap-2 px-1">
                    <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-sm text-slate-500">
                      Usuario: {currentUserName}
                    </span>
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new Event('sorveteria:logout'))}
                      className="rounded-full border border-brand-200 bg-white/80 px-3 py-1.5 text-sm font-medium text-brand-700"
                    >
                      Sair
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </header>
      {deliveryAlerts.length ? (
        <div className="pointer-events-none fixed right-4 top-24 z-50 flex w-[min(92vw,24rem)] flex-col gap-3">
          {deliveryAlerts.map((alert) => (
            <div
              key={alert.id}
              className="pointer-events-auto rounded-2xl border border-emerald-200 bg-white/95 p-4 shadow-xl shadow-emerald-100 backdrop-blur"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-600">Novo Delivery</p>
                  <h3 className="mt-1 text-base font-bold text-slate-900">{alert.customer_name || 'Novo pedido'}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Pedido recebido agora{alert.total ? ` • R$ ${alert.total}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const timeoutId = deliveryAlertTimeoutsRef.current[alert.id]
                    if (timeoutId !== undefined) {
                      window.clearTimeout(timeoutId)
                      delete deliveryAlertTimeoutsRef.current[alert.id]
                    }
                    setDeliveryAlerts((current) => current.filter((item) => item.id !== alert.id))
                  }}
                  className="rounded-full border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500"
                >
                  Fechar
                </button>
              </div>
              <button
                type="button"
                onClick={() => navigate('/delivery')}
                className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Abrir Delivery
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <main className="mx-auto max-w-[1500px] px-3 py-4 sm:px-4 md:px-6 md:py-6 lg:py-8">
        <Suspense fallback={<NavLoading />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootEntryRedirect />,
  },
  {
    path: '/entrar',
    element: <LoginGate mode="entry" />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/',
    element: <LoginGate><Layout /></LoginGate>,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <Navigate to="/caixa" replace /> },
      { path: 'pdv', element: <PDV /> },
      { path: 'caixa', element: <Caixa /> },
      { path: 'cozinha', element: <Cozinha /> },
      { path: 'produtos', element: <Produtos /> },
      { path: 'configuracoes', element: <Configuracoes /> },
      { path: 'fidelidade', element: <Fidelidade /> },
      { path: 'relatorios', element: <Relatorios /> },
      { path: 'delivery', element: <PedidosDelivery /> }
    ]
  },
  {
    path: '/cardapio',
    errorElement: <RouteErrorBoundary />,
    element: (
      <Suspense fallback={<NavLoading />}>
        <PublicMenu />
      </Suspense>
    )
  }
])
