import React, { Suspense, lazy, useEffect } from 'react'
import { Navigate, createBrowserRouter, useRouteError } from 'react-router-dom'
import { getAccessToken, getRefreshToken } from './auth'
import { getErrorMessage, isChunkLoadError, tryRecoverChunk } from './errorHandling'
import { LoginGate } from '../components/LoginGate'
import { LoadingState } from '../components/ui'
import { AppShell } from '../layout/AppShell'

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
  <div className="rounded-2xl border border-[var(--line)] bg-white p-6">
    <LoadingState
      title="Carregando modulo"
      description="Estamos buscando a proxima tela do sistema."
    />
  </div>
)

const RouteErrorBoundary: React.FC = () => {
  const error = useRouteError()

  useEffect(() => {
    if (isChunkLoadError(error)) {
      tryRecoverChunk()
    }
  }, [error])

  const chunkError = isChunkLoadError(error)
  const message =
    typeof error === 'object' && error !== null && 'statusText' in error
        ? String((error as { statusText?: unknown }).statusText ?? 'Erro inesperado')
        : getErrorMessage(error) || 'Erro inesperado'

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
    element: (
      <LoginGate>
        <AppShell />
      </LoginGate>
    ),
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
      { path: 'delivery', element: <PedidosDelivery /> },
    ],
  },
  {
    path: '/cardapio',
    errorElement: <RouteErrorBoundary />,
    element: (
      <Suspense fallback={<NavLoading />}>
        <PublicMenu />
      </Suspense>
    ),
  },
])
