import React, { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'

type KitchenOrder = {
  id: string
  display_number?: string
  status: string
  created_at: string
  subtotal?: string | number
  discount?: string | number
  total?: string | number
  items: Array<{ id: number; product?: number; qty?: string | number; total?: string | number; weight_grams?: number | null; notes?: string | null }>
}

const getOrderDisplayNumber = (order: Pick<KitchenOrder, 'id' | 'display_number'>) => order.display_number || order.id.slice(0, 8)

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
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [feedback, setFeedback] = useState('')
  const [agentUrl, setAgentUrl] = useState('')
  const [storeLabel, setStoreLabel] = useState('Sorveteria POS')
  const [storeAddress, setStoreAddress] = useState('')

  const loadQueue = useCallback(async () => {
    try {
      const [queueResponse, configResponse] = await Promise.all([
        api.get<KitchenOrder[]>('/api/kitchen/queue'),
        api.get<StoreConfigResponse>('/api/config')
      ])
      setOrders(queueResponse.data)
      setAgentUrl(configResponse.data.printer?.agent_url?.trim() ?? '')
      setStoreLabel(configResponse.data.company_name || configResponse.data.store_name || 'Sorveteria POS')
      setStoreAddress(configResponse.data.address || '')
    } catch {
      setFeedback('Falha ao carregar fila da cozinha.')
    }
  }, [])

  useEffect(() => {
    void loadQueue()
  }, [loadQueue])

  const handleReady = async (orderId: string) => {
    try {
      await api.post(`/api/kitchen/${orderId}/ready`)
      setFeedback('Pedido marcado como pronto.')
      await loadQueue()
    } catch {
      setFeedback('Falha ao marcar pedido como pronto.')
    }
  }

  const handleBackToPrep = async (orderId: string) => {
    try {
      await api.post(`/api/kitchen/${orderId}/back-to-prep`)
      setFeedback('Pedido voltou para preparo.')
      await loadQueue()
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
            name: `Produto ${item.product ?? item.id}`,
            qty: Number(item.qty ?? 1),
            weight_grams: item.weight_grams ?? undefined,
            unit_price: Number(item.total ?? 0) / Math.max(Number(item.qty ?? 1) || 1, 1),
            total: Number(item.total ?? 0),
            notes: item.notes ?? undefined
          })),
          subtotal: Number(order.subtotal ?? 0),
          discount: Number(order.discount ?? 0),
          total: Number(order.total ?? 0),
          payments: []
        })
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
        await api.post(`/api/kitchen/${order.id}/print`)
      }
      setFeedback('Lote de pedidos enviado para impressao.')
    } catch {
      setFeedback('Falha ao imprimir lote.')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">KDS - Fila da cozinha</h2>
        <div className="flex gap-2">
          <button onClick={() => void loadQueue()} className="rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700">
            Atualizar
          </button>
          <button onClick={() => void handlePrintBatch()} className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-3 py-2 text-sm font-semibold text-white">
            Imprimir lote
          </button>
        </div>
      </div>

      {feedback ? <p className="text-sm text-brand-700">{feedback}</p> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {orders.map((order) => (
          <article key={order.id} className="panel p-4 md:p-5">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold">Pedido #{getOrderDisplayNumber(order)}</h3>
                <p className="text-sm text-slate-500">{order.items?.length || 0} itens</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(order.status)}`}>
                {statusLabel(order.status)}
              </span>
            </div>

            <div className="mb-4 rounded-xl border border-brand-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Tempo de espera: <span className="font-semibold text-slate-800">{waitLabel(order.created_at)}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => void handleReady(order.id)} className="rounded-lg bg-emerald-600 px-2 py-2 text-xs font-semibold text-white">
                Pronto
              </button>
              <button onClick={() => void handleBackToPrep(order.id)} className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-2 text-xs font-semibold text-amber-700">
                Voltar
              </button>
              <button onClick={() => void handlePrint(order.id)} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-700">
                Imprimir
              </button>
            </div>
          </article>
        ))}
      </div>

      {orders.length === 0 ? <p className="text-sm text-slate-500">Nenhum pedido na fila da cozinha.</p> : null}
    </div>
  )
}

export default Cozinha
