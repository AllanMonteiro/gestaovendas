import React, { useEffect, useState, Suspense, lazy } from 'react'
import { createBrowserRouter, NavLink, Outlet } from 'react-router-dom'
import { useOutboxSync } from './useSync'
import { api } from '../api/client'
import { type AuthSession } from './auth'

// Lazy loading das paginas para reduzir o bundle inicial
const PDV = lazy(() => import('../pages/PDV'))
const Caixa = lazy(() => import('../pages/Caixa'))
const Cozinha = lazy(() => import('../pages/Cozinha'))
const Produtos = lazy(() => import('../pages/Produtos'))
const Configuracoes = lazy(() => import('../pages/Configuracoes'))
const Fidelidade = lazy(() => import('../pages/Fidelidade'))
const Relatorios = lazy(() => import('../pages/Relatorios'))
const PublicMenu = lazy(() => import('../pages/PublicMenu'))
const PedidosDelivery = lazy(() => import('../pages/PedidosDelivery'))

type StoreHeaderConfig = {
  store_name?: string
  logo_url?: string | null
  theme?: string
}

const normalizeTheme = (value?: string | null) => {
  if (!value || value === 'light') return 'cream'
  if (value === 'green' || value === 'blue' || value === 'cream') return value
  return 'cream'
}

const NavLoading: React.FC = () => (
  <div className="flex h-32 w-full animate-pulse items-center justify-center rounded-2xl bg-slate-50 border border-slate-100">
    <div className="text-sm font-medium text-slate-400">Carregando modulo...</div>
  </div>
)

const Layout: React.FC = () => {
  useOutboxSync()

  const [storeName, setStoreName] = useState('Sorveteria POS')
  const [logoUrl, setLogoUrl] = useState<string>('')
  const [theme, setTheme] = useState<string>('cream')
  const [currentUserName, setCurrentUserName] = useState('')

  const links = [
    { to: '/', label: 'Caixa' },
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
          api.get<StoreHeaderConfig>('/api/config'),
          api.get<AuthSession>('/api/auth/session').catch(() => ({ data: null as AuthSession | null }))
        ])
        setStoreName(configResponse.data.store_name || 'Sorveteria POS')
        setLogoUrl(configResponse.data.logo_url || '')
        setTheme(normalizeTheme(configResponse.data.theme))
        setCurrentUserName(sessionResponse.data?.user?.name || sessionResponse.data?.user?.email || '')
      } catch {
        setStoreName('Sorveteria POS')
        setLogoUrl('')
        setTheme('cream')
        setCurrentUserName('')
      }
    }
    void loadConfig()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<string>
      setTheme(normalizeTheme(custom.detail))
    }
    window.addEventListener('sorveteria:theme', handler as EventListener)
    return () => window.removeEventListener('sorveteria:theme', handler as EventListener)
  }, [])

  useEffect(() => {
    const handler = () => {
      setCurrentUserName('')
    }
    window.addEventListener('sorveteria:logout', handler)
    return () => window.removeEventListener('sorveteria:logout', handler)
  }, [])

  return (
    <div className="app-shell">
      <header className="sticky top-0 z-20 border-b border-brand-100 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-[1500px] px-3 py-3 sm:px-4 md:px-6 md:py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start justify-between gap-3 sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo da empresa" className="h-11 w-11 shrink-0 rounded-xl border border-brand-100 object-cover sm:h-12 sm:w-12" />
                ) : null}
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-display tracking-wide text-brand-700 sm:text-2xl lg:text-3xl">{storeName}</h1>
                  <p className="text-xs text-slate-500 sm:text-sm">Operacao local com modo offline-first</p>
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
                          ? 'rounded-full bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow'
                          : 'rounded-full border border-brand-100 bg-white text-slate-700 hover:border-brand-300'
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
              </nav>
              {currentUserName ? (
                <div className="flex items-center justify-end gap-2 px-1">
                  <span className="text-sm text-slate-500">Usuario: {currentUserName}</span>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new Event('sorveteria:logout'))}
                    className="rounded-full border border-brand-200 px-3 py-1.5 text-sm font-medium text-brand-700"
                  >
                    Sair
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>
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
    element: <Layout />,
    children: [
      { index: true, element: <Caixa /> },
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
    element: <Suspense fallback={<div className="p-10 text-center">Carregando cardapio...</div>}><PublicMenu /></Suspense>
  }
])
