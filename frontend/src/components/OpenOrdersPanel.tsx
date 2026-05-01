import React from 'react'
import { Badge, Button, Card, EmptyState, SectionHeader } from './ui'

type OrderItem = {
  id: number
  product_name?: string
  qty: string | number
  total: string | number
}

type OrderSummary = {
  id: string
  display_number?: string
  total: string | number
  customer_name?: string | null
  customer_phone?: string | null
  local_only?: boolean
  client_request_id?: string | null
  items?: OrderItem[]
}

type OpenOrdersPanelProps = {
  openOrders: OrderSummary[]
  closedOrders: OrderSummary[]
  selectedOrderId: string | null
  outboxCount: number
  outboxPreview: Array<{
    id?: number
    method: string
    url: string
    attempts: number
    last_error?: string
  }>
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

const formatOutboxUrl = (url: string) =>
  url.replace(
    /\/api\/orders\/([0-9a-f-]{36})/gi,
    (_match, orderId: string) => `/api/orders/${orderId.slice(0, 8)}`
  )

const isOrderPendingSync = (order: OrderSummary, pendingSyncOrderKeys: Set<string>) =>
  Boolean(
    order.local_only ||
    pendingSyncOrderKeys.has(order.id) ||
    (order.client_request_id && pendingSyncOrderKeys.has(order.client_request_id))
  )

const OpenOrdersPanelComponent: React.FC<OpenOrdersPanelProps> = ({
  openOrders,
  closedOrders,
  selectedOrderId,
  outboxCount,
  outboxPreview,
  isOnline,
  canOperateOrders,
  pendingSyncOrderKeys,
  onRefresh,
  onSelectOrder,
  onOpenNewOrder,
}) => {
  return (
    <Card className="space-y-3.5 p-3.5">
      <SectionHeader
        title="Comandas abertas"
        description="Fila ativa para selecao."
        meta={
          <div className="flex flex-wrap gap-2">
            <Badge variant={isOnline ? 'info' : 'warning'}>{isOnline ? 'Online' : 'Offline'}</Badge>
            <Badge variant={openOrders.length > 0 ? 'brand' : 'neutral'}>
              {openOrders.length} aberta(s)
            </Badge>
          </div>
        }
        actions={
          <Button onClick={onRefresh} variant="secondary" size="sm">
            {isOnline ? 'Atualizar' : 'Offline'}
          </Button>
        }
      />
      {outboxCount > 0 ? (
        <div className="ui-soft-alert ui-soft-alert-warning text-[11px]">
          {outboxCount} operacao(oes) pendente(s) de sincronizacao.
        </div>
      ) : null}
      {outboxPreview.length > 0 ? (
        <details className="rounded-2xl p-3 text-[11px] text-slate-600">
          <summary className="cursor-pointer font-semibold text-orange-700">Ver pendencias</summary>
          <div className="mt-2 space-y-2">
            {outboxPreview.map((item) => (
              <div key={`${item.id ?? item.url}-${item.method}`} className="ui-inline-card p-2.5">
                <div className="font-semibold text-slate-700">
                  {item.method} {formatOutboxUrl(item.url)}
                </div>
                {item.attempts > 0 ? <div>Tentativas: {item.attempts}</div> : null}
                {item.last_error ? <div>Ultimo erro: {item.last_error}</div> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {!isOnline ? (
        <div className="ui-soft-alert ui-soft-alert-danger text-[11px]">
          Modo Offline Ativado.
        </div>
      ) : null}
      <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
        {openOrders.map((order) => (
          <div
            key={order.id}
            className={`ui-list-option w-full px-3 py-2.5 text-sm ${
              selectedOrderId === order.id
                ? 'ui-list-option-active'
                : ''
            }`}
          >
            <button className="w-full text-left" onClick={() => onSelectOrder(order.id)}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">Pedido {getOrderDisplayNumber(order)}</div>
                {isOrderPendingSync(order, pendingSyncOrderKeys) ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    Pendente sync
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-600">
                <span className="truncate">Cliente: {order.customer_name || order.customer_phone || 'Nao informado'}</span>
                <span className="whitespace-nowrap font-medium text-slate-700">{formatBRL(order.total)}</span>
              </div>
            </button>
          </div>
        ))}
        {openOrders.length === 0 ? (
          <EmptyState
            title="Sem comandas abertas"
            description="Abra um novo pedido para iniciar o atendimento no PDV."
          />
        ) : null}
      </div>
      <Button
        onClick={onOpenNewOrder}
        disabled={!canOperateOrders}
        title={!canOperateOrders ? 'Abra o caixa para criar pedido.' : undefined}
        variant="primary"
        size="md"
        fullWidth
      >
        Novo pedido
      </Button>

      {/* Comandas Finalizadas */}
      {closedOrders.length > 0 && (
        <div className="space-y-3 pt-3.5 border-t border-slate-100">
           <SectionHeader
            title="Comandas finalizadas"
            description="Vendas concluidas."
            meta={<Badge variant="neutral">{closedOrders.length}</Badge>}
          />
          <div className="max-h-[30vh] space-y-2 overflow-y-auto pr-1">
            {closedOrders.map((order) => (
              <details key={order.id} className="ui-inline-card group cursor-pointer overflow-hidden p-0 border-transparent bg-slate-50/30">
                <summary className="flex list-none items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-slate-100/50 transition-colors">
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-slate-700">#{getOrderDisplayNumber(order)}</span>
                    <span className="text-[10px] text-slate-500 truncate">
                      {order.customer_name || order.customer_phone || 'Balcao'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">{formatBRL(order.total)}</span>
                    <svg className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </summary>
                <div className="bg-white p-2.5 text-[11px] border-t border-slate-100">
                  {order.items && order.items.length > 0 ? (
                    <ul className="space-y-1.5">
                      {order.items.map((item) => (
                        <li key={item.id} className="flex justify-between gap-3 text-slate-600">
                          <span className="truncate flex-1 font-medium">{item.qty}x {item.product_name}</span>
                          <span className="font-semibold text-slate-500">{formatBRL(item.total)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-400 text-center italic">Sem itens registrados</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

export const OpenOrdersPanel = React.memo(OpenOrdersPanelComponent)
