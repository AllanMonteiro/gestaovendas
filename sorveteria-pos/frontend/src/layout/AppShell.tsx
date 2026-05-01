import React, { Suspense } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useOutboxSync } from '../app/useSync'
import { LoadingState } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { AppHeader } from './AppHeader'
import { DeliveryAlertsHost } from './DeliveryAlertsHost'
import { useBranding } from './useBranding'
import { useDeliveryAlerts } from './useDeliveryAlerts'

const links = [
  { to: '/caixa', label: 'Caixa' },
  { to: '/pdv', label: 'PDV' },
  { to: '/cozinha', label: 'Cozinha' },
  { to: '/produtos', label: 'Produtos' },
  { to: '/configuracoes', label: 'Configuracoes' },
  { to: '/fidelidade', label: 'Fidelidade' },
  { to: '/relatorios', label: 'Relatorios' },
  { to: '/delivery', label: 'Delivery' },
]

const NavLoading: React.FC = () => (
  <div className="rounded-2xl border border-[var(--line)] bg-white p-6">
    <LoadingState
      title="Carregando modulo"
      description="Estamos buscando a proxima tela do sistema."
    />
  </div>
)

export const AppShell: React.FC = () => {
  useOutboxSync()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { branding } = useBranding()
  const { deliveryAlerts, deliverySoundRuntime, dismissAlert, requestDeliverySoundActivation } =
    useDeliveryAlerts(location.pathname)

  return (
    <div className="app-shell">
      <AppHeader
        storeName={branding.store_name}
        logoUrl={branding.logo_url}
        currentUserName={user?.name || user?.email || ''}
        links={links}
        onLogoError={() =>
          window.dispatchEvent(new CustomEvent('sorveteria:branding', { detail: { logo_url: '' } }))
        }
      />

      <DeliveryAlertsHost
        alerts={deliveryAlerts}
        runtime={deliverySoundRuntime}
        onDismiss={dismissAlert}
        onOpenDelivery={() => navigate('/delivery')}
        onUnlockSound={requestDeliverySoundActivation}
      />

      <main className="app-shell__main mx-auto max-w-[1500px] px-3 py-4 sm:px-4 md:px-6 md:py-6 lg:py-7">
        <Suspense fallback={<NavLoading />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
