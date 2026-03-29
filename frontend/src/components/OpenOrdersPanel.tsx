import React from 'react'

type OrderSummary = {
  id: string
  display_number?: string
  total: string | number
  customer_name?: string | null
  customer_phone?: string | null
  local_only?: boolean
  client_request_id?: string | null
}

type OpenOrdersPanelProps = {
  openOrders: OrderSummary[]
  selectedOrderId: string | null
  outboxCount: number
  isOnline: boolean
  canOperateOrders: boolean
  pendingSyncOrderKeys: Set<string>
  onRefresh: () => void
  onSelectOrder: (orderId: string) => void
  onOpenNewOrder: () => void
}

const formatBRL = (value: string | number) => {
  const numberValue = Number(value || 0)
  return numberValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const getOrderDisplayNumber = (order: Pick<OrderSummary, 'id' | 'display_number'>) => order.display_number || order.id.slice(0, 8)

const isOrderPendingSync = (order: OrderSummary, pendingSyncOrderKeys: Set<string>) =>
  Boolean(
    order.local_only ||
    pendingSyncOrderKeys.has(order.id) ||
    (order.client_request_id && pendingSyncOrderKeys.has(order.client_request_id))
  )

const OpenOrdersPanelComponent: React.FC<OpenOrdersPanelProps> = ({
  openOrders,
  selectedOrderId,
  outboxCount,
  isOnline,
  canOperateOrders,
  pendingSyncOrderKeys,
  onRefresh,
  onSelectOrder,
  onOpenNewOrder,
}) => {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Comandas abertas</h2>
        <button onClick={onRefresh} className="text-xs font-semibold text-brand-700">
          {isOnline ? 'Atualizar' : 'Offline'}
        </button>
      </div>
      {outboxCount > 0 ? (
        <div className="mt-2 rounded-lg bg-orange-50 p-2 text-[10px] text-orange-700">
          {outboxCount} pedido(s) pendente(s) de sincronizacao.
        </div>
      ) : null}
      {!isOnline ? (
        <div className="mt-2 rounded-lg bg-red-50 p-2 text-[10px] text-red-700">
          Modo Offline Ativado.
        </div>
      ) : null}
      <div className="mt-4 max-h-[48vh] space-y-2 overflow-y-auto pr-1">
        {openOrders.map((order) => (
          <div
            key={order.id}
            className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
              selectedOrderId === order.id ? 'border-brand-500 bg-brand-50' : 'border-brand-100 bg-brand-50/60'
            }`}
          >
            <button className="w-full text-left" onClick={() => onSelectOrder(order.id)}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">Pedido {getOrderDisplayNumber(order)} | {formatBRL(order.total)}</div>
                {isOrderPendingSync(order, pendingSyncOrderKeys) ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    Pendente sync
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-slate-600">
                Cliente: {order.customer_name || order.customer_phone || 'Nao informado'}
              </div>
            </button>
          </div>
        ))}
        {openOrders.length === 0 ? <p className="text-sm text-slate-500">Sem comandas abertas.</p> : null}
      </div>
      <button
        onClick={onOpenNewOrder}
        disabled={!canOperateOrders}
        title={!canOperateOrders ? 'Abra o caixa para criar pedido.' : undefined}
        className="w-full rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2.5 text-sm font-semibold text-white"
      >
        Novo pedido
      </button>
    </div>
  )
}

export const OpenOrdersPanel = React.memo(OpenOrdersPanelComponent)
