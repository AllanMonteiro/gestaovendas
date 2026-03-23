import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { openThermalReceiptPdf, type ThermalReceiptPayload } from '../app/thermalReceipt'

type Order = {
  id: string
  display_number?: string
  status: string
  total: string
  created_at: string
  closed_at?: string | null
}

type CashStatusResponse = {
  open: boolean
  session?: {
    id: number
    opened_at: string
    initial_float: string
  }
  totals?: {
    cash_sales: string
    reforco: string
    sangria: string
    current_cash_estimated: string
  }
}

type PaymentAgg = {
  method?: 'CASH' | 'PIX' | 'CARD' | 'CARD_CREDIT' | 'CARD_DEBIT'
  payment_method?: 'CASH' | 'PIX' | 'CARD' | 'CARD_CREDIT' | 'CARD_DEBIT'
  total: string
}

type Reconciliation = {
  expected: { cash: string; pix: string; card: string }
  counted: { cash: string; pix: string; card: string }
  divergence: { cash: string; pix: string; card: string }
}

type CashMove = {
  id: number
  type: 'SANGRIA' | 'REFORCO'
  amount: string
  reason: string
  created_at: string
}

type CashHistoryEntry = {
  id: number
  opened_at: string
  closed_at: string
  status: string
  initial_float: string
  reconciliation_data?: Reconciliation
}

type FlowEntry = {
  id: string
  at: string
  kind: 'VENDA_FINALIZADA' | 'REFORCO' | 'SANGRIA'
  description: string
  input: number
  output: number
}

type Summary = {
  total_sales: string | null
  total_orders: number | null
  avg_ticket: string | null
  total_discount: string | null
  canceled_count: number | null
  canceled_total: string | null
}

type StoreConfigResponse = {
  store_name?: string
  company_name?: string | null
  cnpj?: string | null
  address?: string | null
  printer?: {
    agent_url?: string
  }
}

const formatBRL = (value: string | number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const getOrderDisplayNumber = (order: Pick<Order, 'id' | 'display_number'>) => order.display_number || order.id.slice(0, 8)
const formatSignedBRL = (value: string | number) => {
  const numeric = Number(value || 0)
  const prefix = numeric > 0 ? '+' : numeric < 0 ? '-' : ''
  return `${prefix}${formatBRL(Math.abs(numeric))}`
}
const getApiErrorText = (error: unknown, fallback: string) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail === 'string'
  ) {
    return (error as { response: { data: { detail: string } } }).response.data.detail
  }
  return fallback
}

const todayISO = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const Caixa: React.FC = () => {
  const [cashStatus, setCashStatus] = useState<CashStatusResponse>({ open: false })
  const [orders, setOrders] = useState<Order[]>([])
  const [cashMoves, setCashMoves] = useState<CashMove[]>([])
  const [cashHistory, setCashHistory] = useState<CashHistoryEntry[]>([])
  const [paymentsAgg, setPaymentsAgg] = useState<PaymentAgg[]>([])
  const [fromDate, setFromDate] = useState(todayISO())
  const [toDate, setToDate] = useState(todayISO())
  const [feedback, setFeedback] = useState<string>('')
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null)
  const [dailySummary, setDailySummary] = useState<Summary | null>(null)
  const [openOrdersCount, setOpenOrdersCount] = useState(0)
  const [showCashMoveModal, setShowCashMoveModal] = useState(false)
  const [cashMoveType, setCashMoveType] = useState<'SANGRIA' | 'REFORCO'>('REFORCO')
  const [cashMoveAmount, setCashMoveAmount] = useState('')
  const [cashMoveReason, setCashMoveReason] = useState('')
  const [agentUrl, setAgentUrl] = useState('')
  const [storeLabel, setStoreLabel] = useState('Sorveteria POS')
  const [storeCnpj, setStoreCnpj] = useState('')
  const [storeAddress, setStoreAddress] = useState('')

  const loadData = useCallback(async () => {
    const [statusResp, closedResp, moveResp, paymentResp, dailySummaryResp, openOrdersResp, configResp, historyResp] = await Promise.allSettled([
      api.get<CashStatusResponse>('/api/cash/status'),
      api.get<Order[]>(`/api/orders/closed?from=${fromDate}&to=${toDate}`),
      api.get<CashMove[]>(`/api/cash/move?from=${fromDate}&to=${toDate}`),
      api.get<PaymentAgg[]>(`/api/reports/by_payment?from=${fromDate}&to=${toDate}`),
      api.get<Summary>(`/api/reports/summary?from=${todayISO()}&to=${todayISO()}`),
      api.get<Order[]>('/api/orders/open'),
      api.get<StoreConfigResponse>('/api/config'),
      api.get<CashHistoryEntry[]>(`/api/cash/history?from=${fromDate}&to=${toDate}`)
    ])

    if (statusResp.status === 'fulfilled') {
      setCashStatus(statusResp.value.data)
    }
    if (closedResp.status === 'fulfilled') {
      setOrders(closedResp.value.data.sort((a, b) => ((a.closed_at || a.created_at) < (b.closed_at || b.created_at) ? 1 : -1)))
    }
    if (moveResp.status === 'fulfilled') {
      setCashMoves(moveResp.value.data)
    }
    if (historyResp.status === 'fulfilled') {
      setCashHistory(historyResp.value.data)
    }
    if (paymentResp.status === 'fulfilled') {
      setPaymentsAgg(paymentResp.value.data)
    }
    if (dailySummaryResp.status === 'fulfilled') {
      setDailySummary(dailySummaryResp.value.data)
    }
    if (openOrdersResp.status === 'fulfilled') {
      setOpenOrdersCount(openOrdersResp.value.data.length)
    }
    if (configResp.status === 'fulfilled') {
      setAgentUrl(configResp.value.data.printer?.agent_url?.trim() ?? '')
      setStoreLabel(configResp.value.data.company_name || configResp.value.data.store_name || 'Sorveteria POS')
      setStoreCnpj(configResp.value.data.cnpj || '')
      setStoreAddress(configResp.value.data.address || '')
    }

    if (
      statusResp.status === 'rejected' ||
      closedResp.status === 'rejected' ||
      moveResp.status === 'rejected' ||
      paymentResp.status === 'rejected' ||
      dailySummaryResp.status === 'rejected' ||
      openOrdersResp.status === 'rejected' ||
      configResp.status === 'rejected'
    ) {
      setFeedback('Alguns dados do caixa falharam ao atualizar. Tente novamente.')
    }
  }, [fromDate, toDate])

  const postToAgent = useCallback(async (payload: ThermalReceiptPayload) => {
    const normalizedAgentUrl = agentUrl.trim().replace(/\/$/, '')
    if (!normalizedAgentUrl) {
      return false
    }
    const response = await fetch(`${normalizedAgentUrl}/print/receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    return response.ok
  }, [agentUrl])

  const buildCashSlipPayload = useCallback((title: string, details: Array<{ label: string; value: string }>): ThermalReceiptPayload => ({
    company_name: storeLabel,
    address: storeAddress || undefined,
    cnpj: storeCnpj || undefined,
    title,
    cashier: 'CAIXA',
    details,
    items: [],
    subtotal: 0,
    discount: 0,
    total: 0,
    payments: []
  }), [storeAddress, storeCnpj, storeLabel])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const totalsByMethod = useMemo(() => {
    const initial = { CASH: 0, PIX: 0, CARD: 0, CARD_CREDIT: 0, CARD_DEBIT: 0 }
    for (const row of paymentsAgg) {
      const method = row.payment_method ?? row.method
      if (!method) {
        continue
      }
      initial[method] = Number(row.total || 0)
    }
    return initial
  }, [paymentsAgg])

  const flowEntries = useMemo<FlowEntry[]>(() => {
    const salesEntries: FlowEntry[] = orders.map((order) => ({
      id: `sale-${order.id}`,
      at: order.closed_at || order.created_at,
      kind: 'VENDA_FINALIZADA',
      description: `Comanda #${getOrderDisplayNumber(order)} finalizada`,
      input: Number(order.total || 0),
      output: 0,
    }))
    const moveEntries: FlowEntry[] = cashMoves.map((move) => ({
      id: `move-${move.id}`,
      at: move.created_at,
      kind: move.type,
      description:
        move.type === 'REFORCO'
          ? `Reforco: ${move.reason || 'sem motivo'}`
          : `Sangria: ${move.reason || 'sem motivo'}`,
      input: move.type === 'REFORCO' ? Number(move.amount || 0) : 0,
      output: move.type === 'SANGRIA' ? Number(move.amount || 0) : 0,
    }))

    return [...salesEntries, ...moveEntries].sort((a, b) => (a.at < b.at ? 1 : -1))
  }, [orders, cashMoves])

  const reconciliationRows = useMemo(() => [
    {
      label: 'Dinheiro',
      expected: Number(reconciliation?.expected.cash ?? totalsByMethod.CASH),
      counted: Number(reconciliation?.counted.cash ?? 0),
      divergence: Number(reconciliation?.divergence.cash ?? 0),
    },
    {
      label: 'PIX',
      expected: Number(reconciliation?.expected.pix ?? totalsByMethod.PIX),
      counted: Number(reconciliation?.counted.pix ?? 0),
      divergence: Number(reconciliation?.divergence.pix ?? 0),
    },
    {
      label: 'Cartao',
      expected: Number(reconciliation?.expected.card ?? (totalsByMethod.CARD + totalsByMethod.CARD_CREDIT + totalsByMethod.CARD_DEBIT)),
      counted: Number(reconciliation?.counted.card ?? 0),
      divergence: Number(reconciliation?.divergence.card ?? 0),
    }
  ], [reconciliation, totalsByMethod])

  const expectedTotal = reconciliationRows.reduce((total, row) => total + row.expected, 0)
  const countedTotal = reconciliationRows.reduce((total, row) => total + row.counted, 0)
  const divergenceTotal = reconciliationRows.reduce((total, row) => total + row.divergence, 0)

  const handleOpenCash = async () => {
    if (cashStatus.open) {
      setFeedback('Caixa ja esta aberto.')
      return
    }
    const initialFloat = window.prompt('Fundo inicial do caixa (R$):', '0')
    if (!initialFloat) {
      return
    }
    try {
      await api.post('/api/cash/open', { initial_float: initialFloat.replace(',', '.') })
      const slipPayload = buildCashSlipPayload('ABERTURA DE CAIXA', [
        { label: 'Fundo inicial', value: formatBRL(initialFloat.replace(',', '.')) },
        { label: 'Data', value: new Date().toLocaleString('pt-BR') }
      ])
      let printed = false
      try {
        printed = await postToAgent(slipPayload)
      } catch {
        printed = false
      }
      const pdfOpened = !printed ? openThermalReceiptPdf(slipPayload) : false
      setFeedback(
        printed
          ? 'Caixa aberto com sucesso.'
          : pdfOpened
            ? 'Caixa aberto. Cupom aberto para imprimir/salvar em PDF.'
            : 'Caixa aberto, mas a impressao do cupom falhou.'
      )
      await loadData()
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao abrir caixa.'))
    }
  }

  const openCashMoveModal = (type: 'SANGRIA' | 'REFORCO') => {
    if (!cashStatus.open) {
      setFeedback('Abra o caixa antes de registrar movimentacoes.')
      return
    }
    setCashMoveType(type)
    setCashMoveAmount('')
    setCashMoveReason('')
    setShowCashMoveModal(true)
  }

  const handleCashMove = async () => {
    const normalizedAmount = cashMoveAmount.replace(',', '.').trim()
    const numericAmount = Number(normalizedAmount)
    if (!normalizedAmount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFeedback('Informe um valor valido para a movimentacao.')
      return
    }
    if (!cashMoveReason.trim()) {
      setFeedback('Informe o motivo da movimentacao.')
      return
    }
    try {
      await api.post('/api/cash/move', {
        type: cashMoveType,
        amount: normalizedAmount,
        reason: cashMoveReason.trim()
      })
      setShowCashMoveModal(false)
      setCashMoveAmount('')
      setCashMoveReason('')
      setFeedback(cashMoveType === 'REFORCO' ? 'Reforco registrado.' : 'Sangria registrada.')
      await loadData()
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao registrar movimentacao.'))
    }
  }

  const handleCloseCash = async () => {
    if (!cashStatus.open) {
      setFeedback('Nao ha caixa aberto para fechar.')
      return
    }
    const countedCash = window.prompt('Contagem dinheiro (R$):', String(totalsByMethod.CASH))
    if (!countedCash) {
      return
    }
    const countedPix = window.prompt('Contagem PIX (R$):', String(totalsByMethod.PIX))
    if (!countedPix) {
      return
    }
    const countedCard = window.prompt('Contagem cartao (R$):', String(totalsByMethod.CARD + totalsByMethod.CARD_CREDIT + totalsByMethod.CARD_DEBIT))
    if (!countedCard) {
      return
    }

    try {
      const response = await api.post<Reconciliation>('/api/cash/close', {
        counted_cash: countedCash.replace(',', '.'),
        counted_pix: countedPix.replace(',', '.'),
        counted_card: countedCard.replace(',', '.')
      })
      setReconciliation(response.data)
      const slipPayload = buildCashSlipPayload('FECHAMENTO DE CAIXA', [
        { label: 'Dinheiro esperado', value: formatBRL(response.data.expected.cash) },
        { label: 'PIX esperado', value: formatBRL(response.data.expected.pix) },
        { label: 'Cartao esperado', value: formatBRL(response.data.expected.card) },
        { label: 'Dinheiro contado', value: formatBRL(response.data.counted.cash) },
        { label: 'PIX contado', value: formatBRL(response.data.counted.pix) },
        { label: 'Cartao contado', value: formatBRL(response.data.counted.card) },
        { label: 'Divergencia dinheiro', value: formatBRL(response.data.divergence.cash) },
        { label: 'Divergencia PIX', value: formatBRL(response.data.divergence.pix) },
        { label: 'Divergencia cartao', value: formatBRL(response.data.divergence.card) }
      ])
      let printed = false
      try {
        printed = await postToAgent(slipPayload)
      } catch {
        printed = false
      }
      const pdfOpened = !printed ? openThermalReceiptPdf(slipPayload) : false
      setFeedback(
        printed
          ? 'Caixa fechado e conciliado.'
          : pdfOpened
            ? 'Caixa fechado. Cupom aberto para imprimir/salvar em PDF.'
            : 'Caixa fechado, mas a impressao do cupom falhou.'
      )
      await loadData()
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao fechar caixa.'))
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="panel p-4 md:p-5">
          <p className="text-sm text-slate-500">Caixa atual</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {formatBRL(cashStatus.totals?.current_cash_estimated ?? 0)}
          </p>
          <p className="text-xs text-slate-500 mt-1">{cashStatus.open ? 'Sessao aberta' : 'Sessao fechada'}</p>
        </article>
        <article className="panel p-4 md:p-5">
          <p className="text-sm text-slate-500">Abertura do caixa</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {formatBRL(cashStatus.session?.initial_float ?? 0)}
          </p>
          <p className="text-xs text-slate-500 mt-1">{cashStatus.open ? 'Fundo inicial da sessao aberta' : 'Sem sessao aberta'}</p>
        </article>
        <article className="panel p-4 md:p-5">
          <p className="text-sm text-slate-500">Entrada PIX</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{formatBRL(totalsByMethod.PIX)}</p>
        </article>
        <article className="panel p-4 md:p-5">
          <p className="text-sm text-slate-500">Entrada cartao credito</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{formatBRL(totalsByMethod.CARD_CREDIT)}</p>
        </article>
        <article className="panel p-4 md:p-5">
          <p className="text-sm text-slate-500">Entrada cartao debito</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{formatBRL(totalsByMethod.CARD_DEBIT)}</p>
        </article>
        <article className="panel p-4 md:p-5">
          <p className="text-sm text-slate-500">Entrada dinheiro</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{formatBRL(totalsByMethod.CASH)}</p>
        </article>
        <article className="panel p-4 md:p-5">
          <p className="text-sm text-slate-500">Total reforco</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{formatBRL(cashStatus.totals?.reforco ?? 0)}</p>
        </article>
        <article className="panel p-4 md:p-5">
          <p className="text-sm text-slate-500">Total sangria</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{formatBRL(cashStatus.totals?.sangria ?? 0)}</p>
        </article>
      </div>

      <section className="panel p-4 md:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Caixa atual (dinheiro)</h2>
        <input
          type="text"
          readOnly
          value={formatBRL(cashStatus.totals?.current_cash_estimated ?? 0)}
          className="mt-2 w-full rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-lg font-semibold text-brand-700"
        />
        <p className="mt-2 text-xs text-slate-500">
          Fundo: {formatBRL(cashStatus.session?.initial_float ?? 0)} | Dinheiro vendas: {formatBRL(cashStatus.totals?.cash_sales ?? 0)} | Reforco: {formatBRL(cashStatus.totals?.reforco ?? 0)} | Sangria: {formatBRL(cashStatus.totals?.sangria ?? 0)}
        </p>
      </section>

      <section className="panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Fluxo diario do caixa</h2>
          <button onClick={() => void loadData()} className="rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-700">
            Atualizar fluxo
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl border border-brand-100 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">1. Abertura</p>
            <p className={`mt-1 text-sm font-semibold ${cashStatus.open ? 'text-emerald-700' : 'text-amber-700'}`}>
              {cashStatus.open ? 'Caixa aberto' : 'Caixa fechado'}
            </p>
          </div>
          <div className="rounded-xl border border-brand-100 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">2. Vendas de hoje</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {dailySummary?.total_orders ?? 0} pedidos | {formatBRL(dailySummary?.total_sales ?? 0)}
            </p>
            <p className="text-xs text-slate-500">
              Finalizados: {dailySummary?.total_orders ?? 0} | Cancelados: {dailySummary?.canceled_count ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-brand-100 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">3. Fechamento</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              Divergencia atual: {formatSignedBRL(divergenceTotal)}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="panel p-5 space-y-4">
          <h2 className="text-lg font-semibold">Abertura e movimentacoes</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {!cashStatus.open ? (
              <button
                onClick={() => void handleOpenCash()}
                className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-3 py-2 text-sm font-semibold text-white"
              >
                Abrir caixa
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-500"
              >
                Caixa ja aberto
              </button>
            )}
            <button
              onClick={() => openCashMoveModal('SANGRIA')}
              disabled={!cashStatus.open}
              className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sangria
            </button>
            <button
              onClick={() => openCashMoveModal('REFORCO')}
              disabled={!cashStatus.open}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reforco
            </button>
          </div>
        <div className="rounded-xl border border-brand-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {cashStatus.open
            ? `Sessao aberta em ${new Date(cashStatus.session?.opened_at || '').toLocaleString('pt-BR')}`
            : 'Nenhuma sessao de caixa aberta.'}
        </div>
        <div className="rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm text-slate-700">
          Pedidos em aberto: <span className="font-semibold">{openOrdersCount}</span>
        </div>
      </section>

        <section className="panel p-5 space-y-4">
          <h2 className="text-lg font-semibold">Fechamento</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
            <div className="rounded-2xl border border-brand-100 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Previsto</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatBRL(expectedTotal)}</p>
              <p className="mt-1 text-xs text-slate-500">Total esperado para o fechamento.</p>
            </div>
            <div className="rounded-2xl border border-brand-100 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Informado</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{reconciliation ? formatBRL(countedTotal) : '--'}</p>
              <p className="mt-1 text-xs text-slate-500">Aparece apos executar a conciliacao.</p>
            </div>
            <div className={`rounded-2xl border p-4 ${divergenceTotal === 0 ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
              <p className="text-xs uppercase tracking-wide text-slate-500">Divergencia</p>
              <p className={`mt-2 text-2xl font-semibold ${divergenceTotal === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{reconciliation ? formatSignedBRL(divergenceTotal) : '--'}</p>
              <p className="mt-1 text-xs text-slate-500">Negativo indica falta. Positivo indica sobra.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-brand-100 overflow-hidden">
            <div className="grid min-w-[560px] grid-cols-4 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Forma</span>
              <span>Esperado</span>
              <span>Informado</span>
              <span>Divergencia</span>
            </div>
            {reconciliationRows.map((row) => (
              <div key={row.label} className="grid min-w-[560px] grid-cols-4 items-center border-t border-brand-100 px-4 py-3 text-sm">
                <span className="font-semibold text-slate-800">{row.label}</span>
                <span className="text-slate-700">{formatBRL(row.expected)}</span>
                <span className="text-slate-700">{reconciliation ? formatBRL(row.counted) : '--'}</span>
                <span className={row.divergence === 0 ? 'text-emerald-700' : 'font-semibold text-rose-700'}>
                  {reconciliation ? formatSignedBRL(row.divergence) : '--'}
                </span>
              </div>
            ))}
          </div>
          {reconciliation ? (
            <div className="rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-700">
              Conciliacao concluida para esta sessao.
            </div>
          ) : (
            <div className="rounded-xl border border-brand-100 p-3 text-sm text-slate-500">Ainda sem conciliacao nesta sessao. O resumo acima ja mostra o previsto para conferencia.</div>
          )}
          <button
            onClick={() => void handleCloseCash()}
            disabled={openOrdersCount > 0}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Fechar e conciliar
          </button>
          {openOrdersCount > 0 ? (
            <p className="text-xs text-amber-700">Nao e possivel fechar o caixa com pedidos em aberto.</p>
          ) : null}
        </section>
      </div>

      <section className="panel p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Fluxo de caixa (finalizadas, sangria e reforco)</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input value={fromDate} onChange={(event) => setFromDate(event.target.value)} type="date" className="rounded-lg border border-brand-200 px-2 py-1 text-sm" />
            <input value={toDate} onChange={(event) => setToDate(event.target.value)} type="date" className="rounded-lg border border-brand-200 px-2 py-1 text-sm" />
            <button onClick={() => void loadData()} className="text-sm font-semibold text-brand-700">Filtrar periodo</button>
          </div>
        </div>

        {feedback ? <p className="mb-3 text-sm text-brand-700">{feedback}</p> : null}

        <div className="overflow-x-auto">
          <table className="responsive-table w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2">Data/Hora</th>
                <th className="pb-2">Operacao</th>
                <th className="pb-2">Entrada</th>
                <th className="pb-2">Saida</th>
              </tr>
            </thead>
            <tbody>
              {flowEntries.map((entry) => (
                <tr key={entry.id} className="border-t border-brand-100">
                  <td className="py-2">{new Date(entry.at).toLocaleString('pt-BR')}</td>
                  <td className="py-2">{entry.description}</td>
                  <td className="py-2 text-emerald-700">{entry.input > 0 ? formatBRL(entry.input) : '-'}</td>
                  <td className="py-2 text-rose-700">{entry.output > 0 ? formatBRL(entry.output) : '-'}</td>
                </tr>
              ))}
              {flowEntries.length === 0 ? (
                <tr className="border-t border-brand-100">
                  <td colSpan={4} className="py-3 text-center text-slate-500">
                    Nenhum movimento de fluxo no periodo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Historico de Caixa Fechado</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="responsive-table w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2">Abertura</th>
                <th className="pb-2">Fechamento</th>
                <th className="pb-2">Fundo Inicial</th>
                <th className="pb-2">Divergencia (Dinheiro / PIX / Cartao)</th>
              </tr>
            </thead>
            <tbody>
              {cashHistory.map((session) => (
                <tr key={session.id} className="border-t border-brand-100">
                  <td className="py-2">{new Date(session.opened_at).toLocaleString('pt-BR')}</td>
                  <td className="py-2">{new Date(session.closed_at).toLocaleString('pt-BR')}</td>
                  <td className="py-2 font-medium">{formatBRL(session.initial_float)}</td>
                  <td className="py-2">
                    {session.reconciliation_data ? (
                      <div className="flex gap-2 text-xs">
                        <span className={Number(session.reconciliation_data.divergence.cash) === 0 ? 'text-emerald-700' : 'text-rose-700 font-medium'}>
                          Din: {formatSignedBRL(session.reconciliation_data.divergence.cash)}
                        </span>
                        <span className={Number(session.reconciliation_data.divergence.pix) === 0 ? 'text-emerald-700' : 'text-rose-700 font-medium'}>
                          PIX: {formatSignedBRL(session.reconciliation_data.divergence.pix)}
                        </span>
                        <span className={Number(session.reconciliation_data.divergence.card) === 0 ? 'text-emerald-700' : 'text-rose-700 font-medium'}>
                          Car: {formatSignedBRL(session.reconciliation_data.divergence.card)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400">Sem dados</span>
                    )}
                  </td>
                </tr>
              ))}
              {cashHistory.length === 0 ? (
                <tr className="border-t border-brand-100">
                  <td colSpan={4} className="py-3 text-center text-slate-500">
                    Nenhum caixa fechado no periodo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {showCashMoveModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 px-4 pb-4 sm:items-center sm:pb-0">
          <div className="mobile-sheet w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">{cashMoveType === 'REFORCO' ? 'Registrar reforco' : 'Registrar sangria'}</h3>
            <p className="mt-1 text-sm text-slate-500">Preencha o valor e o motivo para registrar a movimentacao no caixa.</p>
            <div className="mt-4 space-y-3">
              <input
                value={cashMoveAmount}
                onChange={(event) => setCashMoveAmount(event.target.value)}
                placeholder="Valor em R$"
                inputMode="decimal"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
              <textarea
                value={cashMoveReason}
                onChange={(event) => setCashMoveReason(event.target.value)}
                placeholder="Motivo da movimentacao"
                rows={3}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowCashMoveModal(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleCashMove()}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${
                  cashMoveType === 'REFORCO' ? 'bg-emerald-600' : 'bg-amber-600'
                }`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default Caixa
