import React, { useState, useEffect } from 'react'
import { api } from '../api/client'
import '../styles.css'

interface Order {
  id: number
  customer_name: string
  customer_phone: string
  address: string
  total: number
  status: string
  created_at: string
  source: string
  pix_payload?: string
}

const PedidosDelivery: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error', text: string } | null>(null)
  const [pulling, setPulling] = useState(false)

  const fetchOrders = async () => {
    try {
      const response = await api.get('/api/orders/')
      setOrders(response.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const port = protocol === 'wss:' ? '' : ':8000'
    const wsUrl = `${protocol}//${window.location.hostname}${port}/ws/pdv/`
    
    const ws = new WebSocket(wsUrl)
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.event === 'order_created' && data.source === 'delivery') {
        fetchOrders()
        const audio = new Audio('/notification.mp3')
        audio.play().catch(() => console.log('Autoplay blocked'))
      }
    }

    return () => ws.close()
  }, [])

  const updateStatus = async (id: number, status: string) => {
    await api.patch(`/api/orders/${id}/`, { status })
    fetchOrders()
  }

  const handlePullFromWhats = async () => {
    setPulling(true)
    setFeedback(null)
    try {
      const text = await navigator.clipboard.readText()
      if (!text || text.length < 5) {
        setFeedback({ type: 'error', text: 'Copie a mensagem do WhatsApp antes de clicar aqui.' })
        return
      }

      // Pro AI Parsing via Backend
      const response = await api.post('/api/whatsapp/manual-parse', { text })
      if (response.data.ok) {
        setFeedback({ type: 'ok', text: `Pedido de ${response.data.customer_name} criado com sucesso!` })
        fetchOrders()
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Erro ao processar mensagem. Verifique a configuração da IA.'
      setFeedback({ type: 'error', text: msg })
    } finally {
      setPulling(false)
    }
  }

  const handleShareCatalog = () => {
    const url = `${window.location.origin}/cardapio`
    const message = `Olá! Confira nosso cardápio digital e faça seu pedido por aqui: ${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-bold">📦 Gestão de Delivery</h1>
        
        <div className="flex gap-2">
          <button 
            onClick={handleShareCatalog}
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition"
          >
            <span>🔗</span> Enviar Cardápio
          </button>
          <button 
            onClick={handlePullFromWhats}
            disabled={pulling}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            <span>📥</span> {pulling ? 'Processando...' : 'Puxar do WhatsApp'}
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`mb-6 p-4 rounded-xl border ${feedback.type === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800'}`}>
          <p className="text-sm font-medium">{feedback.text}</p>
        </div>
      )}
      
      {loading ? (
        <div className="text-center py-20 text-slate-500">Carregando pedidos de hoje...</div>
      ) : (
        <>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4">Pedidos Disponíveis</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.length === 0 ? (
              <div className="col-span-full py-20 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 text-slate-400">
                Nenhum pedido de delivery para exibir no momento.
              </div>
            ) : (
              orders.map(order => (
                <div key={order.id} className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 flex flex-col justify-between hover:shadow-md transition">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <span className="bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full">
                        {order.source}
                      </span>
                      <p className="text-xl font-black text-slate-800">R$ {order.total}</p>
                    </div>

                    <div className="mb-6">
                      <h3 className="font-bold text-lg text-slate-800">{order.customer_name}</h3>
                      <p className="text-xs font-semibold text-slate-400 mt-1">#{order.id} • {new Date(order.created_at).toLocaleTimeString()}</p>
                      <div className="mt-4 space-y-2">
                        <p className="text-sm text-slate-600 flex items-center gap-2">
                          <span className="opacity-50">📞</span> {order.customer_phone}
                        </p>
                        <p className="text-sm text-slate-600 flex items-start gap-2">
                          <span className="opacity-50">📍</span> {order.address}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {order.pix_payload && (
                      <div className="bg-slate-50 p-4 rounded-2xl">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Copia e Cola PIX</p>
                          <button 
                            onClick={() => navigator.clipboard.writeText(order.pix_payload!)}
                            className="text-[10px] font-bold text-brand-600 uppercase"
                          >
                            Copiar
                          </button>
                        </div>
                        <code className="text-[10px] break-all block text-slate-500 line-clamp-2">{order.pix_payload}</code>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => updateStatus(order.id, 'preparo')}
                        className={`flex-1 min-w-[80px] py-2 rounded-2xl text-[10px] font-bold transition ${order.status === 'preparo' ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-slate-100 text-slate-600'}`}
                      >
                        Preparo
                      </button>
                      <button 
                        onClick={() => updateStatus(order.id, 'despachado')}
                        className={`flex-1 min-w-[80px] py-2 rounded-2xl text-[10px] font-bold transition ${order.status === 'despachado' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-600'}`}
                      >
                        🛵 Saiu
                      </button>
                      <button 
                        onClick={() => updateStatus(order.id, 'entregue')}
                        className={`flex-1 min-w-[80px] py-2 rounded-2xl text-[10px] font-bold transition ${order.status === 'entregue' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-slate-100 text-slate-600'}`}
                      >
                        Entregue
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
