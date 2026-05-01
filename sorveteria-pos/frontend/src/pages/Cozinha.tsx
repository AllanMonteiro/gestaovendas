import React, { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import {
  useMarkKitchenOrderReadyMutation,
  useMoveKitchenOrderBackToPrepMutation,
  useQueueKitchenOrderPrintMutation,
} from '../features/orders/hooks/useDeliveryOrderMutations'
import { useKitchenQueue } from '../features/orders/hooks/useKitchenQueue'
import { ordersQueryKeys } from '../features/orders/queryKeys'
import type { KitchenOrder } from '../features/orders/types'
import { useSocket } from '../hooks/useSocket'
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  LoadingState,
  PageHeader,
  SectionHeader,
  StatCard,
} from '../components/ui'

const getOrderDisplayNumber = (order: Pick<KitchenOrder, 'id' | 'display_number'>) =>
  order.display_number || order.id.slice(0, 8)

type StoreConfigResponse = {
  store_name?: string
  company_name?: string | null
  address?: string | null
  printer?: {
    agent_url?: string
  }
}

const statusLabel = (status: string) => {
  if (status === 'READY') return 'PRONTO'
  if (status === 'SENT') return 'PREPARANDO'
  if (status === 'OPEN') return 'NOVO'
  return status
}

const statusClass = (status: string) => {
  if (status === 'READY') return 'bg-emerald-100 text-emerald-700'
  if (status === 'OPEN') return 'bg-sky-100 text-sky-700'
  return 'bg-amber-100 text-amber-700'
}

const waitLabel = (createdAt: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000))
  return `${String(minutes).padStart(2, '0')} min`
}

const Cozinha: React.FC = () => {
  const queryClient = useQueryClient()
  const kitchenQueueQuery = useKitchenQueue()
  const markReadyMutation = useMarkKitchenOrderReadyMutation()
  const moveBackToPrepMutation = useMoveKitchenOrderBackToPrepMutation()
  const queueKitchenPrintMutation = useQueueKitchenOrderPrintMutation()
  const [feedback, setFeedback] = useState('')
  const [agentUrl, setAgentUrl] = useState('')
  const [storeLabel, setStoreLabel] = useState('Sorveteria POS')
  const [storeAddress, setStoreAddress] = useState('')
  const orders = kitchenQueueQuery.data ?? []
  const newOrdersCount = orders.filter((order) => order.status === 'OPEN').length
  const sentOrdersCount = orders.filter((order) => order.status === 'SENT').length
  const readyOrdersCount = orders.filter((order) => order.status === 'READY').length

  const refreshKitchenQueue = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ordersQueryKeys.kitchen.all })
  }, [queryClient])

  const loadKitchenConfig = useCallback(async () => {
    try {
      const configResponse = await api.get<StoreConfigResponse>('/api/config/ui')
      setAgentUrl(configResponse.data.printer?.agent_url?.trim() ?? '')
      setStoreLabel(configResponse.data.company_name || configResponse.data.store_name || 'Sorveteria POS')
      setStoreAddress(configResponse.data.address || '')
    } catch {
      setFeedback('Falha ao carregar configuracoes da cozinha.')
    }
  }, [])

  useEffect(() => {
    void loadKitchenConfig()
  }, [loadKitchenConfig])

  const handleKitchenRealtimeMessage = useCallback((data: unknown) => {
    if (typeof data !== 'object' || data === null || !('event' in data)) {
      return
    }

    const eventName = String((data as { event?: unknown }).event ?? '')
    if (eventName === 'order_sent' || eventName === 'order_ready' || eventName === 'order_status_changed') {
      refreshKitchenQueue()
    }
  }, [refreshKitchenQueue])

  useSocket('/ws/kitchen', {
    onMessage: handleKitchenRealtimeMessage,
  })

  const handleReady = async (orderId: string) => {
    try {
      await markReadyMutation.mutateAsync({ orderId })
      setFeedback('Pedido marcado como pronto.')
    } catch {
      setFeedback('Falha ao marcar pedido como pronto.')
    }
  }

  const handleBackToPrep = async (orderId: string) => {
    try {
      await moveBackToPrepMutation.mutateAsync({ orderId })
      setFeedback('Pedido voltou para preparo.')
    } catch {
      setFeedback('Falha ao voltar pedido para preparo.')
    }
  }

  const handlePrint = async (orderId: string) => {
    try {
      const order = orders.find((item) => item.id === orderId)
      if (!order) {
        setFeedback('Pedido nao encontrado para impressao.')
        return
      }
      const normalizedAgentUrl = agentUrl.replace(/\/$/, '')
      if (!normalizedAgentUrl) {
        setFeedback('Configure o Agent URL para imprimir na cozinha.')
        return
      }
      const response = await fetch(`${normalizedAgentUrl}/print/kitchen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: storeLabel,
          address: storeAddress || undefined,
          order_id: getOrderDisplayNumber(order),
          cashier: 'COZINHA',
          items: order.items.map((item) => ({
            name: item.product_name || `Produto ${item.product ?? item.id}`,
            qty: Number(item.qty ?? 1),
            weight_grams: item.weight_grams ?? undefined,
            unit_price: Number(item.total ?? 0) / Math.max(Number(item.qty ?? 1) || 1, 1),
            total: Number(item.total ?? 0),
            notes: item.notes ?? undefined,
          })),
          subtotal: Number(order.subtotal ?? 0),
          discount: Number(order.discount ?? 0),
          total: Number(order.total ?? 0),
          payments: [],
        }),
      })
      if (!response.ok) {
        setFeedback('Falha ao imprimir pedido.')
        return
      }
      setFeedback('Pedido enviado para impressao.')
    } catch {
      setFeedback('Falha ao imprimir pedido.')
    }
  }

  const handlePrintBatch = async () => {
    if (orders.length === 0) {
      setFeedback('Nao ha pedidos na fila para imprimir.')
      return
    }
    try {
      for (const order of orders) {
        await queueKitchenPrintMutation.mutateAsync({ orderId: order.id })
      }
      setFeedback('Lote de pedidos enviado para impressao.')
    } catch {
      setFeedback('Falha ao imprimir lote.')
    }
  }

  return (
    <div className="ui-screen">
      <PageHeader
        eyebrow="Cozinha"
        title="KDS - fila da cozinha"
        description="Visualizacao operacional para preparo, impressao e liberacao de pedidos, agora com mais contraste e separacao visual."
        meta={<Badge variant="brand">{orders.length} pedido(s)</Badge>}
        actions={
          <>
            <Button variant="secondary" onClick={() => void refreshKitchenQueue()}>Atualizar</Button>
            <Button variant="primary" onClick={() => void handlePrintBatch()}>Imprimir lote</Button>
          </>
        }
      />

      {feedback ? (
        <Card className="p-4" tone="accent">
          <p className="text-sm font-medium text-slate-700">{feedback}</p>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Fila total" value={orders.length} description="Pedidos exibidos no KDS." tone="accent" />
        <StatCard label="Novos" value={newOrdersCount} description="Aguardando inicio." />
        <StatCard label="Preparando" value={sentOrdersCount} description="Em producao." tone="warning" />
        <StatCard label="Prontos" value={readyOrdersCount} description="Aguardando retirada." tone="success" />
      </div>

      {kitchenQueueQuery.isLoading ? (
        <LoadingState title="Carregando fila da cozinha" description="Sincronizando os pedidos em preparo." />
      ) : kitchenQueueQuery.isError ? (
        <Card className="p-6 text-center" tone="danger">Falha ao carregar fila da cozinha.</Card>
      ) : (
        <>
          <Card className="p-4 sm:p-5" tone="accent">
            <SectionHeader
              title="Painel de preparo"
              description="Cards compactos para decidir rapido entre marcar pronto, voltar para preparo ou imprimir."
              meta={<Badge variant={orders.length > 0 ? 'warning' : 'neutral'}>{orders.length > 0 ? 'Fila ativa' : 'Sem fila'}</Badge>}
            />
          </Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => (
            <Card key={order.id} className="p-4 md:p-5">
              <CardHeader className="mb-4">
                <div>
                  <CardTitle>Pedido #{getOrderDisplayNumber(order)}</CardTitle>
                  <CardDescription>{order.items?.length || 0} itens</CardDescription>
                </div>
                <Badge
                  variant={
                    order.status === 'READY'
                      ? 'success'
                      : order.status === 'OPEN'
                        ? 'info'
                        : 'warning'
                  }
                >
                  {statusLabel(order.status)}
                </Badge>
              </CardHeader>

              <Card className="mb-4 px-3 py-2" tone="muted">
                Tempo de espera: <span className="font-semibold text-slate-800">{waitLabel(order.created_at)}</span>
              </Card>

              <div className="grid grid-cols-3 gap-2">
                <Button onClick={() => void handleReady(order.id)} variant="success" size="sm">Pronto</Button>
                <Button onClick={() => void handleBackToPrep(order.id)} variant="warning" size="sm">Voltar</Button>
                <Button onClick={() => void handlePrint(order.id)} variant="secondary" size="sm">Imprimir</Button>
              </div>
            </Card>
          ))}
          </div>
        </>
      )}

      {!kitchenQueueQuery.isLoading && orders.length === 0 ? (
        <EmptyState
          title="Nenhum pedido na fila da cozinha"
          description="Assim que um pedido entrar em preparo, ele aparecera aqui."
        />
      ) : null}
    </div>
  )
}

export default Cozinha
