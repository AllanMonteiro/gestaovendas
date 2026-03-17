import React from 'react'

export type PaymentMethod = 'CASH' | 'PIX' | 'CARD_CREDIT' | 'CARD_DEBIT'

type PaymentModalProps = {
  open: boolean
  total: string | number
  orderLabel?: string
  customerLabel?: string
  method: PaymentMethod
  onChangeMethod: (method: PaymentMethod) => void
  onCancel: () => void
  onConfirm: () => void
  loading?: boolean
  canUsePoints?: boolean
  pointsBalance?: number
  pointValueReal?: number
  minRedeemPoints?: number
  pointsToRedeem?: string
  onChangePointsToRedeem?: (value: string) => void
  effectivePoints?: number
  discountByPoints?: number
  payableTotal?: number
}

const optionClass = (active: boolean) =>
  `px-3 py-2 rounded-lg text-sm font-semibold ${active ? 'bg-brand-500 text-white' : 'bg-brand-100 text-brand-700'}`

const formatBRL = (value: string | number) => {
  const numberValue = Number(value || 0)
  return numberValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  open,
  total,
  orderLabel,
  customerLabel,
  method,
  onChangeMethod,
  onCancel,
  onConfirm,
  loading = false,
  canUsePoints = false,
  pointsBalance = 0,
  pointValueReal = 0,
  minRedeemPoints = 0,
  pointsToRedeem = '0',
  onChangePointsToRedeem,
  effectivePoints = 0,
  discountByPoints = 0,
  payableTotal
}) => {
  if (!open) {
    return null
  }

  const computedPayable = typeof payableTotal === 'number' ? payableTotal : Number(total || 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold">Fechar venda</h3>
        <p className="mt-1 text-sm text-slate-500">Selecione a forma de pagamento para finalizar o pedido.</p>
        {orderLabel || customerLabel ? (
          <p className="mt-1 text-xs text-slate-500">
            Pedido aberto: {orderLabel || '-'} {customerLabel ? `| Cliente: ${customerLabel}` : ''}
          </p>
        ) : null}

        <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Total do pedido</span>
            <strong className="text-brand-700">{formatBRL(total)}</strong>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Desconto por pontos</span>
            <strong className="text-emerald-700">- {formatBRL(discountByPoints)}</strong>
          </div>
          <div className="border-t border-brand-100 pt-2 mt-1 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-slate-500">Total a pagar</span>
            <p className="text-xl font-semibold text-brand-700">{formatBRL(computedPayable)}</p>
          </div>
        </div>

        {canUsePoints ? (
          <div className="mt-4 rounded-xl border border-brand-100 bg-white px-4 py-3 space-y-2">
            <p className="text-sm font-semibold text-slate-700">Fidelidade</p>
            <p className="text-xs text-slate-500">
              Saldo: {pointsBalance} pts | valor do ponto: {formatBRL(pointValueReal)} | minimo: {minRedeemPoints} pts
            </p>
            {pointValueReal <= 0 ? (
              <p className="text-xs text-amber-700">
                Configure o "valor do ponto" em Configuracoes para habilitar desconto por pontos.
              </p>
            ) : null}
            <input
              value={pointsToRedeem}
              onChange={(event) => onChangePointsToRedeem?.(event.target.value)}
              disabled={pointValueReal <= 0 || pointsBalance <= 0}
              className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm"
              placeholder="Pontos para descontar"
              inputMode="numeric"
            />
            <p className="text-xs text-slate-500">Aplicando agora: {effectivePoints} pontos</p>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Pontos so podem ser usados quando o pedido estiver vinculado a um cliente.
          </p>
        )}

        {computedPayable > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => onChangeMethod('CASH')} className={optionClass(method === 'CASH')}>
              Dinheiro
            </button>
            <button onClick={() => onChangeMethod('PIX')} className={optionClass(method === 'PIX')}>
              PIX
            </button>
            <button onClick={() => onChangeMethod('CARD_CREDIT')} className={optionClass(method === 'CARD_CREDIT')}>
              Cartao credito
            </button>
            <button onClick={() => onChangeMethod('CARD_DEBIT')} className={optionClass(method === 'CARD_DEBIT')}>
              Cartao debito
            </button>
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Pedido quitado 100% com pontos.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2 text-sm" disabled={loading}>
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? 'Fechando...' : 'Confirmar pagamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
