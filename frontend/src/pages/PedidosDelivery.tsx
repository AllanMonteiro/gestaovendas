import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useDeleteDeliveryOrderMutation,
  useUpdateDeliveryOrderStatusMutation,
} from '../features/orders/hooks/useDeliveryOrderMutations'
import { useDeliveryOrders } from '../features/orders/hooks/useDeliveryOrders'
import { ordersQueryKeys } from '../features/orders/queryKeys'
import type { DeliveryOrder } from '../features/orders/types'
import { useSocket } from '../hooks/useSocket'
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  SectionHeader,
  LoadingState,
  PageHeader,
  StatCard,
} from '../components/ui'
import { buildFallbackPublicMenuUrl, normalizePublicMenuUrl } from '../app/publicMenuUrl'
import '../styles.css'

type DeliveryConfig = {
  public_menu_url?: string | null
}

const sourceLabel: Record<string, string> = {
  web: 'WEB',
  pdv: 'PDV',
  whatsapp: 'WHATSAPP',
}

const statusLabel: Record<string, string> = {
  novo: 'Novo',
  preparo: 'Em preparo',
  despachado: 'Saiu para entrega',
  entregue: 'Entregue',
}

const statusVariant = (status: string): 'info' | 'warning' | 'success' | 'neutral' => {
  if (status === 'entregue') return 'success'
  if (status === 'despachado') return 'info'
  if (status === 'preparo') return 'warning'
  return 'neutral'
}

const formatBRL = (value: string | number) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const DELIVERY_POLL_INTERVAL_MS = 10000
const DELIVERY_REFRESH_DEBOUNCE_MS = 150

const PedidosDelivery: React.FC = () => {
  const queryClient = useQueryClient()
  const ordersQuery = useDeliveryOrders()
  const updateStatusMutation = useUpdateDeliveryOrderStatusMutation()
  const deleteOrderMutation = useDeleteDeliveryOrderMutation()
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [publicMenuUrl, setPublicMenuUrl] = useState(buildFallbackPublicMenuUrl())
  const wsRefreshTimerRef = useRef<number | null>(null)
  const pollTimerRef = useRef<number | null>(null)
  const orders = ordersQuery.data ?? []
  const preparingCount = orders.filter((order) => order.status === 'preparo').length
  const dispatchedCount = orders.filter((order) => order.status === 'despachado').length
  const deliveredCount = orders.filter((order) => order.status === 'entregue').length
  const refreshOrders = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ordersQueryKeys.delivery.all })
  }, [queryClient])

  useEffect(() => {
    const loadDeliveryConfig = async () => {
      try {
        const response = await api.get<DeliveryConfig>('/api/config/ui')
        setPublicMenuUrl(normalizePublicMenuUrl(response.data.public_menu_url))
      } catch {
        setPublicMenuUrl(buildFallbackPublicMenuUrl())
      }
    }

    void loadDeliveryConfig()
  }, [])

  useEffect(() => {
    pollTimerRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        refreshOrders()
      }
    }, DELIVERY_POLL_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        refreshOrders()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (wsRefreshTimerRef.current !== null) {
        window.clearTimeout(wsRefreshTimerRef.current)
      }
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current)
      }
    }
  }, [refreshOrders])

  const handleRealtimeOrderMessage = useCallback((data: unknown) => {
    if (document.visibilityState !== 'visible') {
      return
    }

    if (
      typeof data !== 'object' ||
      data === null ||
      !('event' in data)
    ) {
      return
    }

    const eventName = String((data as { event?: unknown }).event ?? '')
    const source = String((data as { source?: unknown }).source ?? '')
    const isRelevantDeliveryEvent =
      (eventName === 'order_created' && source === 'delivery') ||
      eventName === 'order_status_changed' ||
      eventName === 'order_paid' ||
      eventName === 'order_canceled'

    if (!isRelevantDeliveryEvent) {
      return
    }

    if (wsRefreshTimerRef.current !== null) {
      window.clearTimeout(wsRefreshTimerRef.current)
    }
    wsRefreshTimerRef.current = window.setTimeout(() => {
      refreshOrders()
    }, DELIVERY_REFRESH_DEBOUNCE_MS)
  }, [refreshOrders])

  useSocket('/ws/pdv', {
    onMessage: handleRealtimeOrderMessage,
  })

  const updateStatus = async (id: string, status: string) => {
    setBusyOrderId(id)
    try {
      await updateStatusMutation.mutateAsync({ id, status })
      setFeedback({ type: 'ok', text: 'Status do pedido atualizado.' })
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Nao foi possivel atualizar o status do pedido.'
      setFeedback({ type: 'error', text: msg })
    } finally {
      setBusyOrderId((current) => (current === id ? null : current))
    }
  }

  const handleDeleteOrder = async (order: DeliveryOrder) => {
    const confirmed = window.confirm(`Excluir o pedido #${order.id}? Essa acao nao pode ser desfeita.`)
    if (!confirmed) {
      return
    }
    setBusyOrderId(order.id)
    try {
      await deleteOrderMutation.mutateAsync(order.id)
      setFeedback({ type: 'ok', text: 'Pedido excluido com sucesso.' })
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Nao foi possivel excluir o pedido.'
      setFeedback({ type: 'error', text: msg })
    } finally {
      setBusyOrderId((current) => (current === order.id ? null : current))
    }
  }

  const handleCopyCatalogLink = async () => {
    try {
      await navigator.clipboard.writeText(publicMenuUrl)
      setFeedback({ type: 'ok', text: 'Link do cardapio copiado.' })
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Nao foi possivel copiar o link do cardapio.' })
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <PageHeader
        eyebrow="Delivery"
        title="Gestao de delivery"
        description="Acompanhe os pedidos do dia com leitura mais clara, mantendo as mesmas acoes de status e exclusao."
        meta={
          <div className="flex flex-wrap gap-2">
            <Badge variant="brand">{orders.length} pedido(s)</Badge>
            <Badge variant="info">Tempo real</Badge>
          </div>
        }
        actions={
          <>
            <Button variant="success" onClick={() => window.open(publicMenuUrl, '_blank', 'noopener,noreferrer')}>
              Abrir cardapio
            </Button>
            <Button variant="primary" onClick={() => void handleCopyCatalogLink()}>
              Copiar link
            </Button>
          </>
        }
      />

      {feedback ? (
        <Card className="p-4" tone={feedback.type === 'ok' ? 'success' : 'danger'}>
          <p className="text-sm font-medium">{feedback.text}</p>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Pedidos no painel" value={orders.length} description="Fila total carregada." tone="accent" />
        <StatCard label="Em preparo" value={preparingCount} description="Pedidos em producao." tone="warning" />
        <StatCard label="Saiu para entrega" value={dispatchedCount} description="Pedidos em rota." />
        <StatCard label="Entregues" value={deliveredCount} description="Concluidos no dia." tone="success" />
      </div>

      {ordersQuery.isLoading ? (
        <LoadingState title="Carregando pedidos de hoje" description="Preparando a fila atual de delivery." />
      ) : ordersQuery.isError ? (
        <Card className="p-6 text-center" tone="danger">Erro ao carregar pedidos de delivery.</Card>
      ) : (
        <>
          <Card className="mb-4 p-4 sm:p-5" tone="accent">
            <SectionHeader
              title="Fila de atendimento"
              description="Os cards mantem o mesmo comportamento operacional, com mais contraste e melhor separacao entre dados e acoes."
              meta={<Badge variant={orders.length > 0 ? 'warning' : 'neutral'}>{orders.length > 0 ? 'Pedidos ativos' : 'Sem pedidos'}</Badge>}
            />
          </Card>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {orders.length === 0 ? (
              <div className="col-span-full">
                <EmptyState
                  title="Nenhum pedido de delivery para exibir"
                  description="Quando um novo pedido chegar, ele sera listado aqui sem alterar o fluxo atual."
                />
              </div>
            ) : (
              orders.map((order) => (
                <Card
                  key={order.id}
                  className="flex flex-col justify-between p-6 transition hover:-translate-y-0.5"
                >
                  <div>
                    <div className="mb-4 flex items-start justify-between">
                      <Badge variant="info" className="uppercase">
                        {sourceLabel[order.source] || order.source}
                      </Badge>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total</p>
                        <p className="text-xl font-black text-slate-800">{formatBRL(order.total)}</p>
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-800">{order.customer_name}</h3>
                        <Badge variant={statusVariant(order.status)}>{statusLabel[order.status] || order.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-400">
                        #{order.id} • {new Date(order.created_at).toLocaleTimeString()}
                      </p>
                      <div className="mt-4 space-y-2">
                        <p className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="opacity-50">Tel</span> {order.customer_phone}
                        </p>
                        <p className="flex items-start gap-2 text-sm text-slate-600">
                          <span className="opacity-50">End</span> {order.address}
                        </p>
                      </div>
                      {order.items && order.items.length > 0 ? (
                        <Card className="mt-4 p-3" tone="muted">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Itens do pedido</p>
                          <div className="mt-2 space-y-2">
                            {order.items.map((item, index) => (
                              <div key={`${order.id}-${index}`} className="flex items-start justify-between gap-3 text-sm text-slate-600">
                                <p>
                                  {item.quantity}x {item.product_name}
                                  {item.unit_price ? ` • ${formatBRL(item.unit_price)} un.` : ''}
                                </p>
                                {item.total ? <p className="whitespace-nowrap font-semibold text-slate-700">{formatBRL(item.total)}</p> : null}
                              </div>
                            ))}
                          </div>
                        </Card>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Card className="p-4">
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>Subtotal dos itens</span>
                        <span className="font-semibold text-slate-800">{formatBRL(order.subtotal)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                        <span>Taxa de entrega</span>
                        <span className="font-semibold text-slate-800">{formatBRL(order.delivery_fee)}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                        <span className="text-sm font-bold uppercase tracking-wider text-slate-500">Total</span>
                        <span className="text-base font-black text-slate-900">{formatBRL(order.total)}</span>
                      </div>
                    </Card>

                    {order.pix_payload ? (
                      <Card className="p-4" tone="muted">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Copia e Cola PIX</p>
                          <Button
                            onClick={() => navigator.clipboard.writeText(order.pix_payload || '')}
                            size="sm"
                            variant="ghost"
                          >
                            Copiar
                          </Button>
                        </div>
                        <code className="block break-all text-[10px] text-slate-500">{order.pix_payload}</code>
                      </Card>
                    ) : null}

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        disabled={busyOrderId === order.id}
                        onClick={() => void updateStatus(order.id, 'preparo')}
                        variant={order.status === 'preparo' ? 'warning' : 'secondary'}
                        size="sm"
                      >
                        Preparo
                      </Button>
                      <Button
                        disabled={busyOrderId === order.id}
                        onClick={() => void updateStatus(order.id, 'despachado')}
                        variant={order.status === 'despachado' ? 'primary' : 'secondary'}
                        size="sm"
                      >
                        Saiu
                      </Button>
                      <Button
                        disabled={busyOrderId === order.id}
                        onClick={() => void updateStatus(order.id, 'entregue')}
                        variant={order.status === 'entregue' ? 'success' : 'secondary'}
                        size="sm"
                      >
                        Entregue
                      </Button>
                      <Button
                        disabled={busyOrderId === order.id}
                        onClick={() => void handleDeleteOrder(order)}
                        variant="danger"
                        size="sm"
                      >
                        {busyOrderId === order.id ? 'Excluindo...' : 'Excluir'}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default PedidosDelivery
