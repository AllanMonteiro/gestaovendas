import React, { useEffect, useRef, useState } from 'react'

export type PaymentMethod = 'CASH' | 'PIX' | 'CARD_CREDIT' | 'CARD_DEBIT'

export type PaymentEntry = {
  method: PaymentMethod
  amount: string
  meta?: Record<string, string> | null
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
  CARD_CREDIT: 'Cartao credito',
  CARD_DEBIT: 'Cartao debito',
}

const formatBRL = (value: string | number) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const parseMoneyInput = (value: string) => Number(value.replace(',', '.')) || 0

const optBtn = (active: boolean) =>
  `flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
    active
      ? 'bg-brand-600 text-white shadow'
      : 'bg-slate-100 text-slate-700 hover:bg-brand-100 hover:text-brand-700'
  }`

type CashFieldProps = {
  value: string
  onChange: (value: string) => void
  dueAmount: number
  invalid: boolean
  compact?: boolean
}

const CashChangeField: React.FC<CashFieldProps> = ({ value, onChange, dueAmount, invalid, compact = false }) => {
  const received = round2(parseMoneyInput(value))
  const changeAmount = round2(Math.max(received - dueAmount, 0))

  return (
    <div className={`rounded-xl border border-emerald-200 bg-emerald-50 ${compact ? 'p-3' : 'p-3'} space-y-2`}>
      <label className={`block font-semibold uppercase tracking-wide text-emerald-800 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        Troco para
      </label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={dueAmount > 0 ? `Ex.: ${dueAmount.toFixed(2).replace('.', ',')}` : 'Informe o valor recebido'}
        inputMode="decimal"
        className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
      />
      <div className="flex items-center justify-between rounded-lg bg-white/80 px-3 py-2">
        <span className="text-sm text-slate-600">Troco</span>
        <strong className="text-emerald-700">{formatBRL(changeAmount)}</strong>
      </div>
      {invalid ? (
        <p className="text-xs text-rose-600">Informe um valor em dinheiro igual ou maior que {formatBRL(dueAmount)}.</p>
      ) : (
        <p className="text-xs text-slate-500">O troco sera calculado automaticamente para este pagamento.</p>
      )}
    </div>
  )
}

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
  const [cashReceivedSingle, setCashReceivedSingle] = useState('')
  const [cashReceived1, setCashReceived1] = useState('')
  const [cashReceived2, setCashReceived2] = useState('')
  const [submitLocked, setSubmitLocked] = useState(false)
  const submitLockedRef = useRef(false)

  const computedPayable = typeof payableTotal === 'number' ? payableTotal : Number(total || 0)
  const amount1Num = round2(parseMoneyInput(amount1))
  const amount2Num = round2(Math.max(computedPayable - amount1Num, 0))

  useEffect(() => {
    if (open) {
      setSplitMode(false)
      setMethod1('CASH')
      setMethod2('PIX')
      setAmount1('')
      setCashReceivedSingle('')
      setCashReceived1('')
      setCashReceived2('')
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

  const buildCashMeta = (cashReceived: number, amount: number) => ({
    cash_received: round2(cashReceived).toFixed(2),
    change_amount: round2(Math.max(cashReceived - amount, 0)).toFixed(2),
  })

  const splitInvalid = splitMode && (amount1Num <= 0 || amount1Num >= computedPayable)
  const singleCashInvalid = !splitMode && method1 === 'CASH' && round2(parseMoneyInput(cashReceivedSingle)) < computedPayable
  const splitCash1Invalid = splitMode && method1 === 'CASH' && amount1Num > 0 && round2(parseMoneyInput(cashReceived1)) < amount1Num
  const splitCash2Invalid = splitMode && method2 === 'CASH' && amount2Num > 0 && round2(parseMoneyInput(cashReceived2)) < amount2Num
  const confirmDisabled = loading || submitLocked || splitInvalid || singleCashInvalid || splitCash1Invalid || splitCash2Invalid

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
      onConfirm([
        {
          method: method1,
          amount: computedPayable.toFixed(2),
          meta: method1 === 'CASH' ? buildCashMeta(parseMoneyInput(cashReceivedSingle), computedPayable) : null,
        },
      ])
      return
    }

    const firstAmount = round2(parseMoneyInput(amount1))
    const secondAmount = round2(computedPayable - firstAmount)
    if (firstAmount <= 0 || secondAmount <= 0) {
      return
    }

    onConfirm([
      {
        method: method1,
        amount: firstAmount.toFixed(2),
        meta: method1 === 'CASH' ? buildCashMeta(parseMoneyInput(cashReceived1), firstAmount) : null,
      },
      {
        method: method2,
        amount: secondAmount.toFixed(2),
        meta: method2 === 'CASH' ? buildCashMeta(parseMoneyInput(cashReceived2), secondAmount) : null,
      },
    ])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-4">
          <h3 className="text-lg font-bold text-white">Fechar venda</h3>
          {(orderLabel || customerLabel) && (
            <p className="mt-0.5 text-xs text-brand-100">
              {orderLabel && `Pedido: ${orderLabel}`}
              {orderLabel && customerLabel ? ' | ' : ''}
              {customerLabel && `Cliente: ${customerLabel}`}
            </p>
          )}
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-1.5 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium text-slate-700">{formatBRL(total)}</span>
            </div>
            {discountByPoints > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-emerald-600">Desconto (pontos)</span>
                <span className="font-semibold text-emerald-700">- {formatBRL(discountByPoints)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-brand-200 pt-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total a pagar</span>
              <span className="text-2xl font-bold text-brand-700">{formatBRL(computedPayable)}</span>
            </div>
          </div>

          {canUsePoints ? (
            <div className="space-y-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-emerald-800">Pontos de fidelidade</p>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  {pointsBalance} pts disponiveis
                </span>
              </div>
              {pointValueReal > 0 ? (
                <>
                  <p className="text-xs text-slate-500">
                    1 ponto = {formatBRL(pointValueReal)} | Minimo para resgatar: {minRedeemPoints} pts
                  </p>
                  <input
                    value={pointsToRedeem}
                    onChange={(event) => onChangePointsToRedeem?.(event.target.value)}
                    disabled={pointsBalance <= 0}
                    className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    placeholder="Pontos para descontar"
                    inputMode="numeric"
                  />
                  {effectivePoints > 0 && (
                    <p className="text-xs font-medium text-emerald-700">
                      Aplicando {effectivePoints} pts = - {formatBRL(discountByPoints)}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-amber-700">Configure o valor do ponto em Configuracoes.</p>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Pontos so podem ser usados quando o pedido estiver vinculado a um cliente.
            </p>
          )}

          {computedPayable > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Forma de pagamento</p>
                <button
                  type="button"
                  onClick={() => setSplitMode((prev) => !prev)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                    splitMode
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-brand-100 hover:text-brand-700'
                  }`}
                >
                  {splitMode ? 'Pagamento dividido' : 'Dividir pagamento'}
                </button>
              </div>

              {!splitMode ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((method) => (
                      <button key={method} onClick={() => setMethod1(method)} className={optBtn(method1 === method)}>
                        {METHOD_LABELS[method]}
                      </button>
                    ))}
                  </div>

                  {method1 === 'CASH' ? (
                    <CashChangeField
                      value={cashReceivedSingle}
                      onChange={setCashReceivedSingle}
                      dueAmount={computedPayable}
                      invalid={singleCashInvalid}
                    />
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">1o pagamento</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((method) => (
                        <button key={method} onClick={() => setMethod1(method)} className={optBtn(method1 === method)}>
                          {METHOD_LABELS[method]}
                        </button>
                      ))}
                    </div>
                    <input
                      value={amount1}
                      onChange={(event) => setAmount1(event.target.value)}
                      placeholder={`Valor (maximo ${formatBRL(computedPayable)})`}
                      inputMode="decimal"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                    {method1 === 'CASH' ? (
                      <CashChangeField
                        value={cashReceived1}
                        onChange={setCashReceived1}
                        dueAmount={amount1Num}
                        invalid={splitCash1Invalid}
                        compact
                      />
                    ) : null}
                  </div>

                  <div className="space-y-2 rounded-xl border border-brand-100 bg-brand-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">2o pagamento</p>
                      <span className="text-sm font-bold text-brand-700">{formatBRL(amount2Num)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((method) => (
                        <button key={method} onClick={() => setMethod2(method)} className={optBtn(method2 === method)}>
                          {METHOD_LABELS[method]}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">
                      Restante calculado automaticamente ({formatBRL(computedPayable)} - {formatBRL(amount1Num)})
                    </p>
                    {method2 === 'CASH' ? (
                      <CashChangeField
                        value={cashReceived2}
                        onChange={setCashReceived2}
                        dueAmount={amount2Num}
                        invalid={splitCash2Invalid}
                        compact
                      />
                    ) : null}
                  </div>

                  {splitInvalid ? (
                    <p className="text-xs text-rose-600">
                      O valor do 1o pagamento deve ser maior que R$ 0,00 e menor que o total.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">
              Pedido quitado 100% com pontos de fidelidade.
            </div>
          )}
        </div>

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
            disabled={confirmDisabled}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Fechando...' : 'Confirmar pagamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
