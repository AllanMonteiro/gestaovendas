import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { connectWS } from '../api/ws'
import '../styles.css'

interface Order {
  items?: Array<{
    product_name: string
    quantity: string | number
  }>
  id: string
  customer_name: string
  customer_phone: string
  address: string
  total: string
  status: string
  created_at: string
  source: string
  pix_payload?: string
}

type OrdersResponse = Order[] | { results?: Order[] } | { data?: Order[] }

const normalizeOrders = (payload: OrdersResponse): Order[] => {
  if (Array.isArray(payload)) {
    return payload
  }
  if (payload && Array.isArray(payload.results)) {
    return payload.results
  }
  if (payload && Array.isArray(payload.data)) {
    return payload.data
  }
  return []
}

const sourceLabel: Record<string, string> = {
  web: 'WEB',
  pdv: 'PDV',
  whatsapp: 'WHATSAPP',
}

const PedidosDelivery: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const wsRefreshTimerRef = useRef<number | null>(null)
  const pollTimerRef = useRef<number | null>(null)

  const fetchOrders = async (options?: { silent?: boolean }) => {
    try {
      const response = await api.get<OrdersResponse>('/api/orders/')
      setOrders(normalizeOrders(response.data))
      setFeedback((current) => (current?.type === 'error' ? null : current))
    } catch (err: any) {
      if (!options?.silent) {
        const msg = err.response?.data?.detail || 'Erro ao carregar pedidos de delivery.'
        setFeedback({ type: 'error', text: msg })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchOrders()

    pollTimerRef.current = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void fetchOrders({ silent: true })
      }
    }, 3000)

    const ws = connectWS('/ws/pdv', (data) => {
      if (data?.event === 'order_created' && data?.source === 'delivery') {
        if (wsRefreshTimerRef.current !== null) {
          window.clearTimeout(wsRefreshTimerRef.current)
        }
        wsRefreshTimerRef.current = window.setTimeout(() => {
          void fetchOrders()
        }, 120)
      }
    })

    return () => {
      ws.close()
      if (wsRefreshTimerRef.current !== null) {
        window.clearTimeout(wsRefreshTimerRef.current)
      }
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current)
      }
    }
  }, [])

  const updateStatus = async (id: string, status: string) => {
    setBusyOrderId(id)
    try {
      await api.patch(`/api/orders/${id}/`, { status })
      setFeedback({ type: 'ok', text: 'Status do pedido atualizado.' })
      void fetchOrders({ silent: true })
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Nao foi possivel atualizar o status do pedido.'
      setFeedback({ type: 'error', text: msg })
    } finally {
      setBusyOrderId((current) => (current === id ? null : current))
    }
  }

  const handleDeleteOrder = async (order: Order) => {
    const confirmed = window.confirm(`Excluir o pedido #${order.id}? Essa acao nao pode ser desfeita.`)
    if (!confirmed) {
      return
    }
    setBusyOrderId(order.id)
    try {
      await api.delete(`/api/orders/${order.id}/`)
      setOrders((current) => current.filter((item) => item.id !== order.id))
      setFeedback({ type: 'ok', text: 'Pedido excluido com sucesso.' })
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Nao foi possivel excluir o pedido.'
      setFeedback({ type: 'error', text: msg })
    } finally {
      setBusyOrderId((current) => (current === order.id ? null : current))
    }
  }

  const publicMenuUrl = `${window.location.origin}/cardapio`

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
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <h1 className="text-3xl font-bold">Gestao de Delivery</h1>

        <div className="flex gap-2">
          <button
            onClick={() => window.open(publicMenuUrl, '_blank', 'noopener,noreferrer')}
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
          >
            <span>Web</span> Abrir Cardapio
          </button>
          <button
            onClick={() => void handleCopyCatalogLink()}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <span>Link</span> Copiar Link
          </button>
        </div>
      </div>

      {feedback ? (
        <div
          className={`mb-6 rounded-xl border p-4 ${
            feedback.type === 'ok'
              ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
              : 'border-rose-100 bg-rose-50 text-rose-800'
          }`}
        >
          <p className="text-sm font-medium">{feedback.text}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="py-20 text-center text-slate-500">Carregando pedidos de hoje...</div>
      ) : (
        <>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-400">Pedidos Disponiveis</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {orders.length === 0 ? (
              <div className="col-span-full rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 py-20 text-center text-slate-400">
                Nenhum pedido de delivery para exibir no momento.
              </div>
            ) : (
              orders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-col justify-between rounded-3xl border border-slate-100 bg-white p-6 shadow-sm transition hover:shadow-md"
                >
                  <div>
                    <div className="mb-4 flex items-start justify-between">
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                        {sourceLabel[order.source] || order.source}
                      </span>
                      <p className="text-xl font-black text-slate-800">R$ {order.total}</p>
                    </div>

                    <div className="mb-6">
                      <h3 className="text-lg font-bold text-slate-800">{order.customer_name}</h3>
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
                        <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Itens do pedido</p>
                          <div className="mt-2 space-y-1">
                            {order.items.map((item, index) => (
                              <p key={`${order.id}-${index}`} className="text-sm text-slate-600">
                                {item.quantity}x {item.product_name}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {order.pix_payload ? (
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Copia e Cola PIX</p>
                          <button
                            onClick={() => navigator.clipboard.writeText(order.pix_payload || '')}
                            className="text-[10px] font-bold uppercase text-brand-600"
                          >
                            Copiar
                          </button>
                        </div>
                        <code className="block break-all text-[10px] text-slate-500">{order.pix_payload}</code>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        disabled={busyOrderId === order.id}
                        onClick={() => void updateStatus(order.id, 'preparo')}
                        className={`rounded-2xl py-2 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          order.status === 'preparo' ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        Preparo
                      </button>
                      <button
                        disabled={busyOrderId === order.id}
                        onClick={() => void updateStatus(order.id, 'despachado')}
                        className={`rounded-2xl py-2 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          order.status === 'despachado' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        Saiu
                      </button>
                      <button
                        disabled={busyOrderId === order.id}
                        onClick={() => void updateStatus(order.id, 'entregue')}
                        className={`rounded-2xl py-2 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          order.status === 'entregue' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        Entregue
                      </button>
                      <button
                        disabled={busyOrderId === order.id}
                        onClick={() => void handleDeleteOrder(order)}
                        className="rounded-2xl bg-rose-50 py-2 text-[10px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyOrderId === order.id ? 'Excluindo...' : 'Excluir'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default PedidosDelivery
