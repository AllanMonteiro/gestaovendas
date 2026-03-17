import React from 'react'

type OrderItem = {
  id: number
  product: number
  qty: string | number
  total: string | number
  notes?: string | null
}

type OrderPanelProps = {
  items: OrderItem[]
  subtotal: string | number
  discount: string | number
  total: string | number
  getProductName: (productId: number) => string
  onEditItem?: (item: OrderItem) => void
  onDeleteItem?: (item: OrderItem) => void
}

const formatBRL = (value: string | number) => {
  const numberValue = Number(value || 0)
  return numberValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export const OrderPanel: React.FC<OrderPanelProps> = ({ items, subtotal, discount, total, getProductName, onEditItem, onDeleteItem }) => {
  return (
    <div className="rounded-xl border border-brand-100 bg-white p-4">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-brand-100 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>Produto</span>
        <span>Qtd</span>
        <span>Total</span>
        <span>Acoes</span>
      </div>

      <div className="space-y-2 py-3 text-sm">
        {items.length === 0 && <p className="text-slate-500">Nenhum item no pedido.</p>}
        {items.map((item) => (
          <div key={item.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3">
            <div>
              <p className="font-medium">{getProductName(item.product)}</p>
              {item.notes ? <p className="text-xs text-slate-500">Obs: {item.notes}</p> : null}
            </div>
            <span>{Number(item.qty)}</span>
            <span>{formatBRL(item.total)}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onEditItem?.(item)}
                className="rounded border border-indigo-300 px-2 py-0.5 text-xs font-semibold text-indigo-700"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => onDeleteItem?.(item)}
                className="rounded border border-rose-300 px-2 py-0.5 text-xs font-semibold text-rose-700"
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-brand-100 pt-3 text-sm">
        <div>
          <p className="text-slate-500">Subtotal</p>
          <p className="font-semibold">{formatBRL(subtotal)}</p>
        </div>
        <div>
          <p className="text-slate-500">Desconto</p>
          <p className="font-semibold">{formatBRL(discount)}</p>
        </div>
        <div>
          <p className="text-slate-500">Total</p>
          <p className="font-semibold text-brand-700">{formatBRL(total)}</p>
        </div>
      </div>
    </div>
  )
}
