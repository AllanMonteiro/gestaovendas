import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { ReportFilters } from '../components/ReportFilters'
import { Badge, Button, Card, PageHeader, SectionHeader, StatCard } from '../components/ui'
import { api } from '../api/client'

const ReportsAnalyticsTabs = lazy(() => import('../components/ReportsAnalyticsTabs').then((module) => ({ default: module.ReportsAnalyticsTabs })))

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
  initial_stock: string
  current_stock: string
}

type CategoryRow = {
  product__category__id: number | null
  product__category__name: string | null
  total: string
}

type PaymentRow = {
  payment_method?: string
  total: string
  fee_pct?: string
  fee_amount?: string
  net_total?: string
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
      card_credit?: string | number | null
      card_debit?: string | number | null
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

type OrderItem = {
  id: string
  product_name: string
  qty: string
  unit_price: string
  total: string
}

type OrderPayment = {
  id: string
  method: 'CASH' | 'PIX' | 'CARD'
  amount: string
  meta?: {
    card_type?: 'CREDIT' | 'DEBIT'
  } | null
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
  payments?: OrderPayment[]
}

type ReportsDashboardResponse = {
  summary: SummaryResponse
  categories: CategoryRow[]
  products: ProductRow[]
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
const formatQty = (value: string | number | null | undefined) =>
  Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
const toISODate = (date: Date) => date.toISOString().slice(0, 10)
const getPaymentRow = (rows: PaymentRow[], method: string) => rows.find((entry) => entry.payment_method === method)
const getPaymentTotal = (rows: PaymentRow[], method: string) => {
  const row = getPaymentRow(rows, method)
  return Number(row?.total || 0)
}
const getPaymentMethodLabel = (method?: string) => {
  if (method === 'CASH') return 'Dinheiro'
  if (method === 'PIX') return 'PIX'
  if (method === 'CARD_CREDIT') return 'Cartao credito'
  if (method === 'CARD_DEBIT') return 'Cartao debito'
  if (method === 'CARD') return 'Cartao sem classificacao'
  return method || 'Nao informado'
}
const getPaymentMethodOption = (payment?: OrderPayment | null) => {
  if (!payment) return 'CASH'
  if (payment.method === 'CARD' && payment.meta?.card_type === 'CREDIT') return 'CARD_CREDIT'
  if (payment.method === 'CARD' && payment.meta?.card_type === 'DEBIT') return 'CARD_DEBIT'
  return payment.method
}
const getOrderDisplayNumber = (order: Pick<OrderRow, 'id' | 'display_number'>) => order.display_number || order.id.slice(0, 8)
const REPORT_ORDER_PAGE_SIZE = 50

const Relatorios: React.FC = () => {
  const initialDate = toISODate(new Date())

  const [fromDate, setFromDate] = useState(initialDate)
  const [toDate, setToDate] = useState(initialDate)
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [cashSummary, setCashSummary] = useState<CashSummary | null>(null)
  const [cashHistory, setCashHistory] = useState<CashHistoryRow[]>([])
  const [finalizedOrders, setFinalizedOrders] = useState<OrderRow[]>([])
  const [canceledOrders, setCanceledOrders] = useState<OrderRow[]>([])
  const [finalizedLimit, setFinalizedLimit] = useState(REPORT_ORDER_PAGE_SIZE)
  const [canceledLimit, setCanceledLimit] = useState(REPORT_ORDER_PAGE_SIZE)
  const [hasMoreFinalized, setHasMoreFinalized] = useState(false)
  const [hasMoreCanceled, setHasMoreCanceled] = useState(false)
  const [orderDetails, setOrderDetails] = useState<Record<string, OrderRow>>({})
  const [feedback, setFeedback] = useState('')
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [editingSaleDateOrderId, setEditingSaleDateOrderId] = useState<string | null>(null)
  const [saleAmountInput, setSaleAmountInput] = useState('')
  const [salePaymentMethod, setSalePaymentMethod] = useState<'CASH' | 'PIX' | 'CARD_CREDIT' | 'CARD_DEBIT'>('CASH')
  const [saleClosedAtInput, setSaleClosedAtInput] = useState('')
  const [saleDatePassword, setSaleDatePassword] = useState('')
  const [savingSaleDateOrderId, setSavingSaleDateOrderId] = useState<string | null>(null)
  const [isReportsLoading, setIsReportsLoading] = useState(false)
  const [reportsLoadError, setReportsLoadError] = useState('')
  const loadReportsRequestIdRef = useRef(0)

  const loadReports = useCallback(async (
    from = fromDate,
    to = toDate,
    options?: {
      finalizedLimit?: number
      canceledLimit?: number
      preserveDetails?: boolean
    }
  ) => {
    const requestId = ++loadReportsRequestIdRef.current
    const nextFinalizedLimit = options?.finalizedLimit ?? finalizedLimit
    const nextCanceledLimit = options?.canceledLimit ?? canceledLimit
    if (!options?.preserveDetails) {
      setIsReportsLoading(true)
    }
    try {
      const [dashboardResp, finalizedResp, canceledResp] = await Promise.all([
        api.get<ReportsDashboardResponse>(`/api/reports/dashboard?from=${from}&to=${to}&limit=20`),
        api.get<OrderRow[]>(`/api/orders/closed?from=${from}&to=${to}&include_items=0&limit=${nextFinalizedLimit}`),
        api.get<OrderRow[]>(`/api/orders/canceled?from=${from}&to=${to}&include_items=0&limit=${nextCanceledLimit}`)
      ])
      if (requestId !== loadReportsRequestIdRef.current) {
        return
      }
      setSummary(dashboardResp.data.summary)
      setCategories(dashboardResp.data.categories)
      setProducts(dashboardResp.data.products)
      setPayments(dashboardResp.data.payments)
      setCashSummary(dashboardResp.data.cash_summary)
      setCashHistory(dashboardResp.data.cash_history)
      setFinalizedOrders(finalizedResp.data)
      setCanceledOrders(canceledResp.data)
      setFinalizedLimit(nextFinalizedLimit)
      setCanceledLimit(nextCanceledLimit)
      setHasMoreFinalized(finalizedResp.data.length >= nextFinalizedLimit)
      setHasMoreCanceled(canceledResp.data.length >= nextCanceledLimit)
      if (!options?.preserveDetails) {
        setOrderDetails({})
        setExpandedOrderId(null)
        setEditingSaleDateOrderId(null)
        setSaleAmountInput('')
        setSalePaymentMethod('CASH')
        setSaleClosedAtInput('')
        setSaleDatePassword('')
      }
      setReportsLoadError('')
      setFeedback('')
    } catch {
      if (requestId === loadReportsRequestIdRef.current) {
        setReportsLoadError('Nao foi possivel carregar a distribuicao financeira para o periodo selecionado.')
        setFeedback('Falha ao carregar relatorios.')
      }
    } finally {
      if (requestId === loadReportsRequestIdRef.current) {
        setIsReportsLoading(false)
      }
    }
  }, [canceledLimit, finalizedLimit, fromDate, toDate])

  const toggleOrderExpansion = async (orderId: string) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null)
      if (editingSaleDateOrderId === orderId) {
        setEditingSaleDateOrderId(null)
        setSaleAmountInput('')
        setSalePaymentMethod('CASH')
        setSaleClosedAtInput('')
        setSaleDatePassword('')
      }
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

  const startSaleDateEdit = (order: OrderRow) => {
    setEditingSaleDateOrderId(order.id)
    const detail = orderDetails[order.id]
    setSaleAmountInput(String(order.total || '0'))
    setSalePaymentMethod(getPaymentMethodOption(detail?.payments?.[0]) as 'CASH' | 'PIX' | 'CARD_CREDIT' | 'CARD_DEBIT')
    
    let localDatetime = ''
    const dt = order.closed_at || order.created_at
    if (dt) {
      const dateObj = new Date(dt)
      dateObj.setMinutes(dateObj.getMinutes() - dateObj.getTimezoneOffset())
      localDatetime = dateObj.toISOString().slice(0, 16)
    }
    setSaleClosedAtInput(localDatetime)
    setSaleDatePassword('')
    setFeedback('')
  }

  const cancelSaleDateEdit = () => {
    setEditingSaleDateOrderId(null)
    setSaleAmountInput('')
    setSalePaymentMethod('CASH')
    setSaleClosedAtInput('')
    setSaleDatePassword('')
  }

  const handleAdjustSaleDate = async (orderId: string) => {
    if (!saleAmountInput.trim()) {
      setFeedback('Informe o novo valor da venda.')
      return
    }
    if (!saleDatePassword.trim()) {
      setFeedback('Informe sua senha para confirmar o ajuste.')
      return
    }
    setSavingSaleDateOrderId(orderId)
    try {
      await api.post(`/api/orders/${orderId}/adjust-finalized-sale`, {
        total: saleAmountInput.replace(',', '.'),
        payment_method: salePaymentMethod,
        password: saleDatePassword.trim(),
        closed_at: saleClosedAtInput ? new Date(saleClosedAtInput).toISOString() : undefined,
      })
      setFeedback('Valor e pagamento da venda atualizados com sucesso.')
      cancelSaleDateEdit()
      await loadReports(fromDate, toDate, { preserveDetails: false })
    } catch (error: any) {
      const message = error?.response?.data?.detail || 'Nao foi possivel atualizar valor e pagamento da venda.'
      setFeedback(message)
    } finally {
      setSavingSaleDateOrderId(null)
    }
  }

  useEffect(() => {
    void loadReports(initialDate, initialDate, {
      finalizedLimit: REPORT_ORDER_PAGE_SIZE,
      canceledLimit: REPORT_ORDER_PAGE_SIZE,
      preserveDetails: false,
    })
  }, [initialDate, loadReports])

  const handleQuickRange = (days: 0 | 1 | 7 | 30) => {
    const now = new Date()
    if (days === 0) {
      const today = toISODate(now)
      setFromDate(today)
      setToDate(today)
      void loadReports(today, today, {
        finalizedLimit: REPORT_ORDER_PAGE_SIZE,
        canceledLimit: REPORT_ORDER_PAGE_SIZE,
        preserveDetails: false,
      })
      return
    }
    if (days === 1) {
      const yesterday = new Date(now)
      yesterday.setDate(now.getDate() - 1)
      const y = toISODate(yesterday)
      setFromDate(y)
      setToDate(y)
      void loadReports(y, y, {
        finalizedLimit: REPORT_ORDER_PAGE_SIZE,
        canceledLimit: REPORT_ORDER_PAGE_SIZE,
        preserveDetails: false,
      })
      return
    }
    const start = new Date(now)
    start.setDate(now.getDate() - (days - 1))
    const from = toISODate(start)
    const to = toISODate(now)
    setFromDate(from)
    setToDate(to)
    void loadReports(from, to, {
      finalizedLimit: REPORT_ORDER_PAGE_SIZE,
      canceledLimit: REPORT_ORDER_PAGE_SIZE,
      preserveDetails: false,
    })
  }

  const handleApplyFilters = useCallback(() => {
    void loadReports(fromDate, toDate, {
      finalizedLimit: REPORT_ORDER_PAGE_SIZE,
      canceledLimit: REPORT_ORDER_PAGE_SIZE,
      preserveDetails: false,
    })
  }, [fromDate, loadReports, toDate])

  const handleLoadMoreFinalized = useCallback(() => {
    const nextLimit = finalizedLimit + REPORT_ORDER_PAGE_SIZE
    void loadReports(fromDate, toDate, {
      finalizedLimit: nextLimit,
      canceledLimit,
      preserveDetails: true,
    })
  }, [canceledLimit, finalizedLimit, fromDate, loadReports, toDate])

  const handleLoadMoreCanceled = useCallback(() => {
    const nextLimit = canceledLimit + REPORT_ORDER_PAGE_SIZE
    void loadReports(fromDate, toDate, {
      finalizedLimit,
      canceledLimit: nextLimit,
      preserveDetails: true,
    })
  }, [canceledLimit, finalizedLimit, fromDate, loadReports, toDate])

  const cards = [
    { label: 'Faturamento finalizado', value: formatBRL(summary?.total_sales), description: 'Receita consolidada do periodo', tone: 'accent' as const },
    { label: 'Pedidos finalizados', value: formatNumber(summary?.total_orders), description: 'Operacoes concluidas com sucesso' },
    { label: 'Ticket medio', value: formatBRL(summary?.avg_ticket), description: 'Media por pedido finalizado' },
    { label: 'Descontos', value: formatBRL(summary?.total_discount), description: 'Valor concedido no periodo' },
    { label: 'Pedidos cancelados', value: formatNumber(summary?.canceled_count), description: 'Ocorrencias de cancelamento', tone: 'warning' as const },
    { label: 'Total cancelado', value: formatBRL(summary?.canceled_total), description: 'Impacto financeiro dos cancelamentos', tone: 'danger' as const },
  ]
  const paymentCards = [
    { label: 'Dinheiro', value: formatBRL(getPaymentTotal(payments, 'CASH')), description: 'Vendas em especie no periodo' },
    { label: 'PIX', value: formatBRL(getPaymentTotal(payments, 'PIX')), description: 'Transferencias confirmadas' },
    { label: 'Cartao credito', value: formatBRL(getPaymentTotal(payments, 'CARD_CREDIT')), description: 'Recebimentos em credito' },
    { label: 'Cartao debito', value: formatBRL(getPaymentTotal(payments, 'CARD_DEBIT')), description: 'Recebimentos em debito' },
    ...(getPaymentTotal(payments, 'CARD') > 0
      ? [{ label: 'Cartao sem classificacao', value: formatBRL(getPaymentTotal(payments, 'CARD')), description: 'Lancamentos antigos sem detalhe de tipo', tone: 'warning' as const }]
      : []),
  ]
  const paymentSummaryRows = ['CASH', 'PIX', 'CARD_CREDIT', 'CARD_DEBIT', 'CARD']
    .map((method) => getPaymentRow(payments, method))
    .filter((row): row is PaymentRow => Boolean(row))

  const selectedPeriodLabel = fromDate === toDate
    ? new Date(`${fromDate}T00:00:00`).toLocaleDateString('pt-BR')
    : `${new Date(`${fromDate}T00:00:00`).toLocaleDateString('pt-BR')} ate ${new Date(`${toDate}T00:00:00`).toLocaleDateString('pt-BR')}`
  const topCategory = categories[0]?.product__category__name || 'Sem categoria'
  const topProduct = products[0]?.product__name || 'Sem destaque'

  return (
    <div className="ui-screen">
      <PageHeader
        eyebrow="Analytics"
        title="Relatorios"
        description="Acompanhe vendas, pagamentos e comportamento operacional com leitura mais clara e foco em decisao rapida."
        meta={
          <div className="flex flex-wrap gap-2">
            <Badge variant="brand">{selectedPeriodLabel}</Badge>
            <Badge variant="neutral">{formatNumber(summary?.total_orders)} pedidos no periodo</Badge>
            <Badge variant={isReportsLoading ? 'warning' : 'success'}>
              {isReportsLoading ? 'Atualizando dados' : 'Dados prontos'}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <section className="ui-spotlight-card">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <p className="ui-spotlight-eyebrow">Panorama do periodo</p>
              <h2 className="ui-spotlight-title">Leitura executiva para decidir mais rapido.</h2>
              <p className="ui-spotlight-copy">
                Combine faturamento, ticket medio e cancelamentos em uma visao unica para enxergar o pulso da operacao sem trocar de tela.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="brand">{selectedPeriodLabel}</Badge>
                <Badge variant="neutral">{paymentSummaryRows.length} meios com movimento</Badge>
                <Badge variant="info">{topCategory}</Badge>
              </div>
            </div>
            <div className="min-w-[15rem] space-y-2">
              <p className="ui-spotlight-eyebrow">Receita consolidada</p>
              <p className="ui-spotlight-value">{formatBRL(summary?.total_sales)}</p>
              <p className="text-sm text-slate-600">Pedidos finalizados e pagamentos reunidos no intervalo atual.</p>
            </div>
          </div>
        </section>

        <section className="ui-spotlight-card ui-spotlight-card-muted">
          <div className="space-y-4">
            <div>
              <p className="ui-spotlight-eyebrow">Sinais principais</p>
              <h2 className="ui-spotlight-title">O que merece atencao agora</h2>
            </div>
            <div className="ui-micro-grid">
              <article className="ui-micro-card">
                <p className="ui-micro-label">Ticket medio</p>
                <p className="ui-micro-value">{formatBRL(summary?.avg_ticket)}</p>
                <p className="ui-micro-copy">Media por pedido no periodo.</p>
              </article>
              <article className="ui-micro-card">
                <p className="ui-micro-label">Pedidos</p>
                <p className="ui-micro-value">{formatNumber(summary?.total_orders)}</p>
                <p className="ui-micro-copy">Operacoes concluidas com sucesso.</p>
              </article>
              <article className="ui-micro-card">
                <p className="ui-micro-label">Produto lider</p>
                <p className="ui-micro-value">{topProduct}</p>
                <p className="ui-micro-copy">Destaque do ranking atual.</p>
              </article>
              <article className="ui-micro-card">
                <p className="ui-micro-label">Cancelamentos</p>
                <p className="ui-micro-value">{formatNumber(summary?.canceled_count)}</p>
                <p className="ui-micro-copy">Ocorrencias que pedem revisao.</p>
              </article>
            </div>
          </div>
        </section>
      </div>

      <ReportFilters
        fromDate={fromDate}
        toDate={toDate}
        onChangeFrom={setFromDate}
        onChangeTo={setToDate}
        onQuickRange={handleQuickRange}
        onApply={handleApplyFilters}
      />

      {feedback ? (
        <Card className="p-4 text-sm text-amber-900" tone="warning">
          {feedback}
        </Card>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            description={card.description}
            tone={card.tone}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <StatCard label="Categoria lider" value={topCategory} description="Primeiro destaque do ranking por categoria." tone="accent" />
        <StatCard label="Produto lider" value={topProduct} description="Primeiro item da leitura analitica atual." />
        <StatCard label="Lucro estimado" value={formatBRL(summary?.gross_profit_estimated)} description="Consolidado informado pelo dashboard." tone="success" />
      </div>

      <Card className="p-5">
        <SectionHeader
          title="Resumo por pagamento"
          description="Separacao financeira do periodo entre dinheiro, PIX, credito e debito."
          meta={<Badge variant="neutral">{paymentSummaryRows.length} forma(s) com movimento</Badge>}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {paymentCards.map((card) => (
            <StatCard
              key={card.label}
              label={card.label}
              value={card.value}
              description={card.description}
              tone={card.tone}
            />
          ))}
        </div>
        <div className="mt-5 overflow-x-auto rounded-xl border border-brand-100">
          <table className="min-w-full text-sm">
            <thead className="bg-brand-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Forma</th>
                <th className="px-3 py-2 text-right font-medium">Recebido</th>
                <th className="px-3 py-2 text-right font-medium">Taxa</th>
                <th className="px-3 py-2 text-right font-medium">Desconto</th>
                <th className="px-3 py-2 text-right font-medium">Liquido</th>
              </tr>
            </thead>
            <tbody>
              {paymentSummaryRows.map((row) => (
                <tr key={row.payment_method || 'unknown'} className="border-t border-brand-100">
                  <td className="px-3 py-3 font-medium text-slate-800">{getPaymentMethodLabel(row.payment_method)}</td>
                  <td className="px-3 py-3 text-right">{formatBRL(row.total)}</td>
                  <td className="px-3 py-3 text-right">{Number(row.fee_pct || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</td>
                  <td className="px-3 py-3 text-right text-rose-700">{formatBRL(row.fee_amount)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-emerald-700">{formatBRL(row.net_total ?? row.total)}</td>
                </tr>
              ))}
              {paymentSummaryRows.length === 0 ? (
                <tr className="border-t border-brand-100">
                  <td colSpan={5} className="px-3 py-3 text-center text-slate-500">
                    Sem recebimentos no periodo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Suspense
        fallback={
          <Card className="p-5" tone="accent">
            <SectionHeader
              title="Analytics gerencial"
              description="Carregando graficos e comparativos sob demanda para manter a tela inicial mais leve."
            />
          </Card>
        }
      >
        <ReportsAnalyticsTabs
          fromDate={fromDate}
          toDate={toDate}
          payments={payments}
          paymentsError={!isReportsLoading ? reportsLoadError : ''}
          selectedPeriodLabel={selectedPeriodLabel}
        />
      </Suspense>

      <Card className="p-5">
        <SectionHeader
          title="Entradas por categoria"
          description="Valores finalizados por categoria no periodo filtrado."
          meta={<Badge variant="neutral">{categories.length} categoria(s)</Badge>}
        />
        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/70 bg-white/75 shadow-sm shadow-brand-100/40">
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
      </Card>

      <Card className="p-5">
        <SectionHeader
          title="Tabela analitica"
          description="Quantidade vendida, estoque e receita por produto."
          meta={<Badge variant="neutral">{products.length} produto(s)</Badge>}
        />
        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/70 bg-white/75 shadow-sm shadow-brand-100/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-2">Produto</th>
                <th className="pb-2">Qtd vendida</th>
                <th className="pb-2">Qtd inicial</th>
                <th className="pb-2">Qtd atual</th>
                <th className="pb-2">Receita</th>
              </tr>
            </thead>
            <tbody>
              {products.map((row) => (
                <tr key={row.product__id} className="border-t border-brand-100">
                  <td className="py-2">{row.product__name}</td>
                  <td className="py-2">{formatQty(row.qty)}</td>
                  <td className="py-2">{formatQty(row.initial_stock)}</td>
                  <td className="py-2">{formatQty(row.current_stock)}</td>
                  <td className="py-2">{formatBRL(row.total)}</td>
                </tr>
              ))}
              {products.length === 0 ? (
                <tr className="border-t border-brand-100">
                  <td colSpan={5} className="py-3 text-center text-slate-500">
                    Sem dados no periodo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Pedidos finalizados</h3>
              <p className="text-sm text-slate-500">Comandas concluídas no período filtrado.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {formatNumber(finalizedOrders.length)} pedidos
              </span>
              {hasMoreFinalized ? (
                <button
                  type="button"
                  onClick={handleLoadMoreFinalized}
                  className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700"
                >
                  Carregar mais
                </button>
              ) : null}
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/70 bg-white/75 shadow-sm shadow-brand-100/40">
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
                          <div className="ui-inline-card">
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
                            <div className="ui-soft-alert ui-soft-alert-warning mt-4">
                              <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Ajuste de valor e pagamento</p>
                              <p className="mt-1 text-xs text-amber-800">
                                Use apenas para corrigir erro de digitacao no fechamento. O ajuste substitui o pagamento atual e exige sua senha.
                              </p>
                              {editingSaleDateOrderId === order.id ? (
                                <div className="mt-3 grid gap-2 md:grid-cols-[160px_160px_180px_140px_auto_auto]">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={saleAmountInput}
                                    onChange={(event) => setSaleAmountInput(event.target.value)}
                                    placeholder="Valor"
                                    className="rounded-lg border border-amber-200 px-3 py-2 text-sm"
                                  />
                                  <select
                                    value={salePaymentMethod}
                                    onChange={(event) => setSalePaymentMethod(event.target.value as 'CASH' | 'PIX' | 'CARD_CREDIT' | 'CARD_DEBIT')}
                                    className="rounded-lg border border-amber-200 px-3 py-2 text-sm"
                                  >
                                    <option value="CASH">Dinheiro</option>
                                    <option value="PIX">PIX</option>
                                    <option value="CARD_CREDIT">Cartao credito</option>
                                    <option value="CARD_DEBIT">Cartao debito</option>
                                  </select>
                                  <input
                                    type="datetime-local"
                                    value={saleClosedAtInput}
                                    onChange={(event) => setSaleClosedAtInput(event.target.value)}
                                    className="rounded-lg border border-amber-200 px-3 py-2 text-sm"
                                    title="Data e hora da venda"
                                  />
                                  <input
                                    type="password"
                                    value={saleDatePassword}
                                    onChange={(event) => setSaleDatePassword(event.target.value)}
                                    placeholder="Senha"
                                    className="rounded-lg border border-amber-200 px-3 py-2 text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleAdjustSaleDate(order.id)}
                                    disabled={savingSaleDateOrderId === order.id}
                                    className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                                  >
                                    {savingSaleDateOrderId === order.id ? 'Salvando...' : 'Salvar'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelSaleDateEdit}
                                    disabled={savingSaleDateOrderId === order.id}
                                    className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-700 disabled:opacity-60"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startSaleDateEdit(order)}
                                  className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-700"
                                >
                                  Ajustar valor e pagamento
                                </button>
                              )}
                            </div>
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
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Pedidos cancelados</h3>
              <p className="text-sm text-slate-500">Cancelamentos registrados no período filtrado.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                {formatNumber(canceledOrders.length)} pedidos
              </span>
              {hasMoreCanceled ? (
                <button
                  type="button"
                  onClick={handleLoadMoreCanceled}
                  className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700"
                >
                  Carregar mais
                </button>
              ) : null}
            </div>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/70 bg-white/75 shadow-sm shadow-brand-100/40">
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
                          <div className="ui-inline-card">
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
        </Card>
      </section>
    </div>
  )
}

export default Relatorios
