import React, { useEffect, useRef, useState } from 'react'

export type PaymentMethod = 'CASH' | 'PIX' | 'CARD_CREDIT' | 'CARD_DEBIT'

export type PaymentEntry = {
  method: PaymentMethod
  amount: string
}

type PaymentModalProps = {
  open: boolean
  total: string | number
  orderLabel?: string
  customerLabel?: string
  onCancel: () => void
  onConfirm: (payments: PaymentEntry[]) => void
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

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  CARD_CREDIT: 'Cartão Crédito',
  CARD_DEBIT: 'Cartão Débito',
}

const formatBRL = (value: string | number) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

const optBtn = (active: boolean) =>
  `flex-1 py-2 px-3 rounded-xl text-sm font-semibold transition-all ${
    active
      ? 'bg-brand-600 text-white shadow'
      : 'bg-slate-100 text-slate-700 hover:bg-brand-100 hover:text-brand-700'
  }`

export const PaymentModal: React.FC<PaymentModalProps> = ({
  open,
  total,
  orderLabel,
  customerLabel,
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
  payableTotal,
}) => {
  const [splitMode, setSplitMode] = useState(false)
  const [method1, setMethod1] = useState<PaymentMethod>('CASH')
  const [method2, setMethod2] = useState<PaymentMethod>('PIX')
  const [amount1, setAmount1] = useState('')
  const [submitLocked, setSubmitLocked] = useState(false)
  const submitLockedRef = useRef(false)

  const computedPayable = typeof payableTotal === 'number' ? payableTotal : Number(total || 0)
  const amount1Num = round2(Number(amount1.replace(',', '.')) || 0)
  const amount2Num = round2(Math.max(computedPayable - amount1Num, 0))

  // Reset on open
  useEffect(() => {
    if (open) {
      setSplitMode(false)
      setMethod1('CASH')
      setMethod2('PIX')
      setAmount1('')
      submitLockedRef.current = false
      setSubmitLocked(false)
    }
  }, [open])

  useEffect(() => {
    if (!loading) {
      submitLockedRef.current = false
      setSubmitLocked(false)
    }
  }, [loading])

  if (!open) return null

  const handleConfirm = () => {
    if (loading || submitLockedRef.current) {
      return
    }
    submitLockedRef.current = true
    setSubmitLocked(true)
    if (computedPayable <= 0) {
      onConfirm([])
      return
    }
    if (!splitMode) {
      onConfirm([{ method: method1, amount: computedPayable.toFixed(2) }])
      return
    }
    // Split mode
    const a1 = round2(Number(amount1.replace(',', '.')) || 0)
    const a2 = round2(computedPayable - a1)
    if (a1 <= 0 || a2 <= 0) {
      return
    }
    onConfirm([
      { method: method1, amount: a1.toFixed(2) },
      { method: method2, amount: a2.toFixed(2) },
    ])
  }

  const splitInvalid = splitMode && (amount1Num <= 0 || amount1Num >= computedPayable)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-4">
          <h3 className="text-lg font-bold text-white">Fechar Venda</h3>
          {(orderLabel || customerLabel) && (
            <p className="mt-0.5 text-xs text-brand-100">
              {orderLabel && `Pedido: ${orderLabel}`}
              {orderLabel && customerLabel ? ' · ' : ''}
              {customerLabel && `Cliente: ${customerLabel}`}
            </p>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Resumo de valores */}
          <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium text-slate-700">{formatBRL(total)}</span>
            </div>
            {discountByPoints > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-emerald-600">Desconto (pontos)</span>
                <span className="font-semibold text-emerald-700">− {formatBRL(discountByPoints)}</span>
              </div>
            )}
            <div className="border-t border-brand-200 pt-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total a pagar</span>
              <span className="text-2xl font-bold text-brand-700">{formatBRL(computedPayable)}</span>
            </div>
          </div>

          {/* Fidelidade */}
          {canUsePoints ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-emerald-800">🎁 Pontos de Fidelidade</p>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  {pointsBalance} pts disponíveis
                </span>
              </div>
              {pointValueReal > 0 ? (
                <>
                  <p className="text-xs text-slate-500">
                    1 ponto = {formatBRL(pointValueReal)} · Mínimo para resgatar: {minRedeemPoints} pts
                  </p>
                  <input
                    value={pointsToRedeem}
                    onChange={(e) => onChangePointsToRedeem?.(e.target.value)}
                    disabled={pointsBalance <= 0}
                    className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    placeholder="Pontos para descontar"
                    inputMode="numeric"
                  />
                  {effectivePoints > 0 && (
                    <p className="text-xs text-emerald-700 font-medium">
                      ✓ Aplicando {effectivePoints} pts = − {formatBRL(discountByPoints)}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-amber-700">Configure o valor do ponto em Configurações.</p>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Pontos só podem ser usados quando o pedido estiver vinculado a um cliente.
            </p>
          )}

          {/* Formas de pagamento */}
          {computedPayable > 0 ? (
            <div className="space-y-3">
              {/* Toggle split */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Forma de pagamento</p>
                <button
                  type="button"
                  onClick={() => setSplitMode((prev) => !prev)}
                  className={`text-xs font-semibold px-3 py-1 rounded-lg transition-all ${
                    splitMode
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-brand-100 hover:text-brand-700'
                  }`}
                >
                  {splitMode ? '✓ Pagamento dividido' : '+ Dividir pagamento'}
                </button>
              </div>

              {!splitMode ? (
                // Pagamento único
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                    <button key={m} onClick={() => setMethod1(m)} className={optBtn(method1 === m)}>
                      {METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>
              ) : (
                // Pagamento dividido
                <div className="space-y-3">
                  {/* Pagamento 1 */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">1º Pagamento</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                        <button key={m} onClick={() => setMethod1(m)} className={optBtn(method1 === m)}>
                          {METHOD_LABELS[m]}
                        </button>
                      ))}
                    </div>
                    <input
                      value={amount1}
                      onChange={(e) => setAmount1(e.target.value)}
                      placeholder={`Valor (máximo ${formatBRL(computedPayable)})`}
                      inputMode="decimal"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>

                  {/* Pagamento 2 */}
                  <div className="rounded-xl border border-brand-100 bg-brand-50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">2º Pagamento</p>
                      <span className="text-sm font-bold text-brand-700">{formatBRL(amount2Num)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                        <button key={m} onClick={() => setMethod2(m)} className={optBtn(method2 === m)}>
                          {METHOD_LABELS[m]}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">
                      Restante calculado automaticamente ({formatBRL(computedPayable)} − {formatBRL(amount1Num)})
                    </p>
                  </div>

                  {splitInvalid && (
                    <p className="text-xs text-rose-600">
                      O valor do 1º pagamento deve ser maior que R$ 0,00 e menor que o total.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700 font-semibold text-center">
              🎉 Pedido quitado 100% com pontos de fidelidade!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || submitLocked || splitInvalid}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Fechando...' : 'Confirmar pagamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
