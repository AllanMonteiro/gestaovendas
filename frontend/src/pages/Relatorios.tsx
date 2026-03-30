import React, { Suspense, lazy, useEffect, useState } from 'react'
import { ReportFilters } from '../components/ReportFilters'
import { api } from '../api/client'

type SummaryResponse = {
  total_sales: string | null
  total_orders: number | null
  avg_ticket: string | null
  total_discount: string | null
  gross_profit_estimated?: string | null
  canceled_count: number | null
  canceled_total: string | null
}

type ProductRow = {
  product__id: number
  product__name: string
  total: string
  qty: string
}

type CategoryRow = {
  product__category__id: number | null
  product__category__name: string | null
  total: string
}

type DailySalesRow = {
  day: string
  total: string
  count: number
}

type PaymentRow = {
  payment_method?: string
  total: string
}

type CashBreakdown = {
  initial_float: string | number
  cash_sales: string | number
  reforco: string | number
  sangria: string | number
  expected_cash: string | number
  counted_cash: string | number
  divergence_cash: string | number
}

type CashHistoryRow = {
  id: number
  opened_at: string
  closed_at: string | null
  initial_float: string | number
  reconciliation_data?: {
    divergence?: {
      cash?: string | number
      pix?: string | number
      card?: string | number
    }
  } | null
  cash_breakdown?: CashBreakdown | null
}

type CashSummary = {
  sessions_count: number
  initial_float_total: string | number
  cash_sales_total: string | number
  reforco_total: string | number
  sangria_total: string | number
  expected_cash_total: string | number
  counted_cash_total: string | number
  divergence_cash_total: string | number
}

type ChartGranularity = 'day' | 'week' | 'month'

type OrderItem = {
  id: string
  product_name: string
  qty: string
  unit_price: string
  total: string
}

type OrderRow = {
  id: string
  display_number?: string
  total: string
  created_at: string
  closed_at?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  canceled_reason?: string | null
  items?: OrderItem[]
}

type ReportsDashboardResponse = {
  summary: SummaryResponse
  categories: CategoryRow[]
  products: ProductRow[]
  daily_sales: DailySalesRow[]
  payments: PaymentRow[]
  cash_summary: CashSummary
  cash_history: CashHistoryRow[]
}

const formatBRL = (value: string | number | null | undefined) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatSignedBRL = (value: string | number | null | undefined) => {
  const numeric = Number(value || 0)
  const absolute = Math.abs(numeric)
  const formatted = absolute.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  if (numeric > 0) return `+${formatted}`
  if (numeric < 0) return `-${formatted}`
  return formatted
}
const formatNumber = (value: number | null | undefined) => Number(value || 0).toLocaleString('pt-BR')
const toISODate = (date: Date) => date.toISOString().slice(0, 10)
const toMonthValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const monthRange = (value: string) => {
  const [year, month] = value.split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  return { from: toISODate(start), to: toISODate(end) }
}
const getOrderDisplayNumber = (order: Pick<OrderRow, 'id' | 'display_number'>) => order.display_number || order.id.slice(0, 8)
const Charts = lazy(async () => {
  const module = await import('../components/Charts')
  return { default: module.Charts }
})

const Relatorios: React.FC = () => {
  const initialMonth = toMonthValue(new Date())
  const initialRange = monthRange(initialMonth)

  const [selectedMonth, setSelectedMonth] = useState(initialMonth)
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>('day')
  const [fromDate, setFromDate] = useState(initialRange.from)
  const [toDate, setToDate] = useState(initialRange.to)
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [dailySales, setDailySales] = useState<DailySalesRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [cashSummary, setCashSummary] = useState<CashSummary | null>(null)
  const [cashHistory, setCashHistory] = useState<CashHistoryRow[]>([])
  const [finalizedOrders, setFinalizedOrders] = useState<OrderRow[]>([])
  const [canceledOrders, setCanceledOrders] = useState<OrderRow[]>([])
  const [orderDetails, setOrderDetails] = useState<Record<string, OrderRow>>({})
  const [feedback, setFeedback] = useState('')
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)

  const loadReports = async (from = fromDate, to = toDate) => {
    try {
      const [dashboardResp, finalizedResp, canceledResp] = await Promise.all([
        api.get<ReportsDashboardResponse>(`/api/reports/dashboard?from=${from}&to=${to}&limit=20`),
        api.get<OrderRow[]>(`/api/orders/closed?from=${from}&to=${to}&include_items=0`),
        api.get<OrderRow[]>(`/api/orders/canceled?from=${from}&to=${to}&include_items=0`)
      ])
      setSummary(dashboardResp.data.summary)
      setCategories(dashboardResp.data.categories)
      setProducts(dashboardResp.data.products)
      setDailySales(dashboardResp.data.daily_sales)
      setPayments(dashboardResp.data.payments)
      setCashSummary(dashboardResp.data.cash_summary)
      setCashHistory(dashboardResp.data.cash_history)
      setFinalizedOrders(finalizedResp.data)
      setCanceledOrders(canceledResp.data)
      setOrderDetails({})
      setExpandedOrderId(null)
      setFeedback('')
    } catch {
      setFeedback('Falha ao carregar relatorios.')
    }
  }

  const toggleOrderExpansion = async (orderId: string) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null)
      return
    }
    setExpandedOrderId(orderId)
    if (orderDetails[orderId]) {
      return
    }
    try {
      const response = await api.get<OrderRow>(`/api/orders/${orderId}/detail`)
      setOrderDetails((current) => ({ ...current, [orderId]: response.data }))
    } catch {
      setFeedback('Falha ao carregar itens do pedido.')
    }
  }

  useEffect(() => {
    void loadReports(initialRange.from, initialRange.to)
  }, [])

  const handleMonthChange = (value: string) => {
    setSelectedMonth(value)
    const range = monthRange(value)
    setFromDate(range.from)
    setToDate(range.to)
    void loadReports(range.from, range.to)
  }

  const handleQuickRange = (days: 0 | 1 | 7 | 30) => {
    const now = new Date()
    if (days === 0) {
      const today = toISODate(now)
      setSelectedMonth(toMonthValue(now))
      setFromDate(today)
      setToDate(today)
      void loadReports(today, today)
      return
    }
    if (days === 1) {
      const yesterday = new Date(now)
      yesterday.setDate(now.getDate() - 1)
      const y = toISODate(yesterday)
      setSelectedMonth(toMonthValue(yesterday))
      setFromDate(y)
      setToDate(y)
      void loadReports(y, y)
      return
    }
    const start = new Date(now)
    start.setDate(now.getDate() - (days - 1))
    const from = toISODate(start)
    const to = toISODate(now)
    setSelectedMonth(toMonthValue(now))
    setFromDate(from)
    setToDate(to)
    void loadReports(from, to)
  }

  const cards = [
    { label: 'Faturamento finalizado', value: formatBRL(summary?.total_sales) },
    { label: 'Pedidos finalizados', value: formatNumber(summary?.total_orders) },
    { label: 'Ticket medio', value: formatBRL(summary?.avg_ticket) },
    { label: 'Descontos', value: formatBRL(summary?.total_discount) },
    { label: 'Pedidos cancelados', value: formatNumber(summary?.canceled_count) },
    { label: 'Total cancelado', value: formatBRL(summary?.canceled_total) },
    { label: 'Entradas em dinheiro', value: formatBRL(cashSummary?.cash_sales_total) },
    { label: 'Saldo esperado em caixa', value: formatBRL(cashSummary?.expected_cash_total) },
  ]

  const selectedMonthLabel = new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  })

  return (
    <div className="space-y-5">
      <ReportFilters
        fromDate={fromDate}
        toDate={toDate}
        onChangeFrom={setFromDate}
        onChangeTo={setToDate}
        onQuickRange={handleQuickRange}
        onApply={() => void loadReports()}
      />

      {feedback ? <p className="text-sm text-brand-700">{feedback}</p> : null}

      <section className="panel p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Filtro mensal dos graficos</h3>
            <p className="text-sm text-slate-500">Selecione um mes para ver a distribuicao diaria das vendas.</p>
          </div>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <span>Mes</span>
            <input
              value={selectedMonth}
              onChange={(event) => handleMonthChange(event.target.value)}
              type="month"
              className="rounded-lg border border-brand-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { value: 'day', label: 'Dia' },
            { value: 'week', label: 'Semana' },
            { value: 'month', label: 'Mes' }
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setChartGranularity(option.value as ChartGranularity)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                chartGranularity === option.value
                  ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow'
                  : 'border border-brand-200 bg-white text-brand-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((card) => (
          <article key={card.label} className="panel p-4">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{card.value}</p>
          </article>
        ))}
      </div>

      <Suspense fallback={<div className="panel p-5 text-sm text-slate-500">Carregando graficos...</div>}>
        <Charts
          dailySales={dailySales}
          payments={payments}
          chartGranularity={chartGranularity}
          selectedPeriodLabel={selectedMonthLabel}
        />
      </Suspense>

      <section className="panel p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Entradas por categoria</h3>
            <p className="text-sm text-slate-500">Valores finalizados por categoria no periodo filtrado.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2">Categoria</th>
                <th className="pb-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((row, index) => (
                <tr key={`${row.product__category__id ?? 'sem-categoria'}-${index}`} className="border-t border-brand-100">
                  <td className="py-2">{row.product__category__name || 'Sem categoria'}</td>
                  <td className="py-2 text-right font-medium">{formatBRL(row.total)}</td>
                </tr>
              ))}
              {categories.length === 0 ? (
                <tr className="border-t border-brand-100">
                  <td colSpan={2} className="py-3 text-center text-slate-500">
                    Sem categorias com vendas no periodo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Fechamentos de caixa</h3>
            <p className="text-sm text-slate-500">Resumo em dinheiro seguindo o mesmo filtro do relatorio.</p>
          </div>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            {formatNumber(cashSummary?.sessions_count)} fechamento(s)
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Fundo inicial</p>
            <p className="mt-2 text-xl font-semibold">{formatBRL(cashSummary?.initial_float_total)}</p>
          </article>
          <article className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Reforcos</p>
            <p className="mt-2 text-xl font-semibold">{formatBRL(cashSummary?.reforco_total)}</p>
          </article>
          <article className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Sangrias</p>
            <p className="mt-2 text-xl font-semibold">{formatBRL(cashSummary?.sangria_total)}</p>
          </article>
          <article className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Saldo esperado em dinheiro</p>
            <p className="mt-2 text-xl font-semibold">{formatBRL(cashSummary?.expected_cash_total)}</p>
          </article>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2">Abertura</th>
                <th className="pb-2">Fechamento</th>
                <th className="pb-2">Entradas dinheiro</th>
                <th className="pb-2">Saldo esperado</th>
                <th className="pb-2">Divergencia (Dinheiro / PIX / Cartao)</th>
              </tr>
            </thead>
            <tbody>
              {cashHistory.map((session) => (
                <tr key={session.id} className="border-t border-brand-100">
                  <td className="py-2">{new Date(session.opened_at).toLocaleString('pt-BR')}</td>
                  <td className="py-2">{session.closed_at ? new Date(session.closed_at).toLocaleString('pt-BR') : '-'}</td>
                  <td className="py-2 font-medium">{formatBRL(session.cash_breakdown?.cash_sales ?? 0)}</td>
                  <td className="py-2 font-medium">{formatBRL(session.cash_breakdown?.expected_cash ?? 0)}</td>
                  <td className="py-2">
                    {session.reconciliation_data?.divergence ? (
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className={Number(session.reconciliation_data.divergence.cash ?? 0) === 0 ? 'text-emerald-700' : 'text-rose-700 font-medium'}>
                          Din: {formatSignedBRL(session.reconciliation_data.divergence.cash)}
                        </span>
                        <span className={Number(session.reconciliation_data.divergence.pix ?? 0) === 0 ? 'text-emerald-700' : 'text-rose-700 font-medium'}>
                          PIX: {formatSignedBRL(session.reconciliation_data.divergence.pix)}
                        </span>
                        <span className={Number(session.reconciliation_data.divergence.card ?? 0) === 0 ? 'text-emerald-700' : 'text-rose-700 font-medium'}>
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
                  <td colSpan={5} className="py-3 text-center text-slate-500">
                    Nenhum fechamento de caixa no periodo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel p-5">
        <h3 className="mb-3 text-lg font-semibold">Tabela analitica</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2">Produto</th>
                <th className="pb-2">Qtd</th>
                <th className="pb-2">Receita</th>
              </tr>
            </thead>
            <tbody>
              {products.map((row) => (
                <tr key={row.product__id} className="border-t border-brand-100">
                  <td className="py-2">{row.product__name}</td>
                  <td className="py-2">{Number(row.qty || 0).toLocaleString('pt-BR')}</td>
                  <td className="py-2">{formatBRL(row.total)}</td>
                </tr>
              ))}
              {products.length === 0 ? (
                <tr className="border-t border-brand-100">
                  <td colSpan={3} className="py-3 text-center text-slate-500">
                    Sem dados no periodo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <article className="panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Pedidos finalizados</h3>
              <p className="text-sm text-slate-500">Comandas concluídas no período filtrado.</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {formatNumber(finalizedOrders.length)} pedidos
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm lg:text-base">
              <thead>
                <tr className="text-left text-slate-500 text-xs uppercase tracking-wider">
                  <th className="pb-3 pl-2">Pedido</th>
                  <th className="pb-3">Cliente</th>
                  <th className="pb-3">Fechado em</th>
                  <th className="pb-3 text-right pr-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100">
                {finalizedOrders.map((order) => (
                  <React.Fragment key={order.id}>
                    <tr 
                      onClick={() => void toggleOrderExpansion(order.id)}
                      className={`cursor-pointer transition-colors hover:bg-brand-50 ${expandedOrderId === order.id ? 'bg-brand-50/50' : ''}`}
                    >
                      <td className="py-3 pl-2 font-bold text-brand-900">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] transition-transform ${expandedOrderId === order.id ? 'rotate-90' : ''}`}>▶</span>
                          #{getOrderDisplayNumber(order)}
                        </div>
                      </td>
                      <td className="py-3 text-slate-600">{order.customer_name || order.customer_phone || 'Nao informado'}</td>
                      <td className="py-3 text-xs text-slate-400">{new Date(order.closed_at || order.created_at).toLocaleString('pt-BR')}</td>
                      <td className="py-3 text-right pr-2 font-bold text-emerald-700">{formatBRL(order.total)}</td>
                    </tr>
                    {expandedOrderId === order.id && (
                      <tr>
                        <td colSpan={4} className="bg-brand-50/30 px-4 py-3">
                          <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-inner">
                            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-brand-400">Itens do Pedido</p>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-slate-400">
                                  <th className="pb-1">Descricao</th>
                                  <th className="pb-1 text-center font-normal">Qtd</th>
                                  <th className="pb-1 text-right font-normal">Un.</th>
                                  <th className="pb-1 text-right pr-1">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {orderDetails[order.id] === undefined ? (
                                  <tr>
                                    <td colSpan={4} className="py-3 text-center text-slate-400">
                                      Carregando itens...
                                    </td>
                                  </tr>
                                ) : null}
                                {(orderDetails[order.id]?.items ?? []).map((item) => (
                                  <tr key={item.id}>
                                    <td className="py-2 font-medium text-slate-700">{item.product_name}</td>
                                    <td className="py-2 text-center text-slate-600">{Number(item.qty).toLocaleString('pt-BR')}</td>
                                    <td className="py-2 text-right text-slate-400">{formatBRL(item.unit_price)}</td>
                                    <td className="py-2 text-right pr-1 font-semibold text-slate-800">{formatBRL(item.total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {finalizedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      Nenhum pedido finalizado no periodo.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Pedidos cancelados</h3>
              <p className="text-sm text-slate-500">Cancelamentos registrados no período filtrado.</p>
            </div>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              {formatNumber(canceledOrders.length)} pedidos
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm lg:text-base">
              <thead>
                <tr className="text-left text-slate-500 text-xs uppercase tracking-wider">
                  <th className="pb-3 pl-2">Pedido</th>
                  <th className="pb-3">Cliente</th>
                  <th className="pb-3">Motivo</th>
                  <th className="pb-3 text-right pr-2">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-100">
                {canceledOrders.map((order) => (
                  <React.Fragment key={order.id}>
                    <tr 
                      onClick={() => void toggleOrderExpansion(order.id)}
                      className={`cursor-pointer transition-colors hover:bg-brand-50 ${expandedOrderId === order.id ? 'bg-brand-50/50' : ''}`}
                    >
                      <td className="py-3 pl-2 font-bold text-brand-900">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] transition-transform ${expandedOrderId === order.id ? 'rotate-90' : ''}`}>▶</span>
                          #{getOrderDisplayNumber(order)}
                        </div>
                      </td>
                      <td className="py-3 text-slate-600">{order.customer_name || order.customer_phone || 'Nao informado'}</td>
                      <td className="py-3 text-xs text-slate-400">{order.canceled_reason || 'Sem motivo'}</td>
                      <td className="py-3 text-right pr-2 font-bold text-rose-700">{formatBRL(order.total)}</td>
                    </tr>
                    {expandedOrderId === order.id && (
                      <tr>
                        <td colSpan={4} className="bg-brand-50/30 px-4 py-3">
                          <div className="rounded-xl border border-brand-100 bg-white p-3 shadow-inner">
                            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-brand-400">Itens Cancelados</p>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-slate-400">
                                  <th className="pb-1">Descricao</th>
                                  <th className="pb-1 text-center font-normal">Qtd</th>
                                  <th className="pb-1 text-right font-normal">Un.</th>
                                  <th className="pb-1 text-right pr-1">Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {orderDetails[order.id] === undefined ? (
                                  <tr>
                                    <td colSpan={4} className="py-3 text-center text-slate-400">
                                      Carregando itens...
                                    </td>
                                  </tr>
                                ) : null}
                                {(orderDetails[order.id]?.items ?? []).map((item) => (
                                  <tr key={item.id}>
                                    <td className="py-2 font-medium text-slate-700">{item.product_name}</td>
                                    <td className="py-2 text-center text-slate-600">{Number(item.qty).toLocaleString('pt-BR')}</td>
                                    <td className="py-2 text-right text-slate-400">{formatBRL(item.unit_price)}</td>
                                    <td className="py-2 text-right pr-1 font-semibold text-slate-800">{formatBRL(item.total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {canceledOrders.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      Nenhum pedido cancelado no periodo.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  )
}

export default Relatorios
