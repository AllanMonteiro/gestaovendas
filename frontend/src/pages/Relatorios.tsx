import React, { useEffect, useState } from 'react'
import { ReportFilters } from '../components/ReportFilters'
import { Charts } from '../components/Charts'
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

type DailySalesRow = {
  day: string
  total: string
  count: number
}

type PaymentRow = {
  payment_method?: string
  total: string
}

type ChartGranularity = 'day' | 'week' | 'month'

type OrderRow = {
  id: string
  display_number?: string
  total: string
  created_at: string
  closed_at?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  canceled_reason?: string | null
}

const formatBRL = (value: string | number | null | undefined) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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

const Relatorios: React.FC = () => {
  const initialMonth = toMonthValue(new Date())
  const initialRange = monthRange(initialMonth)

  const [selectedMonth, setSelectedMonth] = useState(initialMonth)
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>('day')
  const [fromDate, setFromDate] = useState(initialRange.from)
  const [toDate, setToDate] = useState(initialRange.to)
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [dailySales, setDailySales] = useState<DailySalesRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [finalizedOrders, setFinalizedOrders] = useState<OrderRow[]>([])
  const [canceledOrders, setCanceledOrders] = useState<OrderRow[]>([])
  const [feedback, setFeedback] = useState('')

  const loadReports = async (from = fromDate, to = toDate) => {
    try {
      const [summaryResp, productsResp, dailySalesResp, paymentsResp, finalizedResp, canceledResp] = await Promise.all([
        api.get<SummaryResponse>(`/api/reports/summary?from=${from}&to=${to}`),
        api.get<ProductRow[]>(`/api/reports/by_product?from=${from}&to=${to}&limit=20`),
        api.get<DailySalesRow[]>(`/api/reports/daily_sales?from=${from}&to=${to}`),
        api.get<PaymentRow[]>(`/api/reports/by_payment?from=${from}&to=${to}`),
        api.get<OrderRow[]>(`/api/orders/closed?from=${from}&to=${to}`),
        api.get<OrderRow[]>(`/api/orders/canceled?from=${from}&to=${to}`)
      ])
      setSummary(summaryResp.data)
      setProducts(productsResp.data)
      setDailySales(dailySalesResp.data)
      setPayments(paymentsResp.data)
      setFinalizedOrders(finalizedResp.data)
      setCanceledOrders(canceledResp.data)
      setFeedback('')
    } catch {
      setFeedback('Falha ao carregar relatorios.')
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
    { label: 'Total cancelado', value: formatBRL(summary?.canceled_total) }
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

      <Charts
        dailySales={dailySales}
        payments={payments}
        chartGranularity={chartGranularity}
        selectedPeriodLabel={selectedMonthLabel}
      />

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
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2">Pedido</th>
                  <th className="pb-2">Cliente</th>
                  <th className="pb-2">Fechado em</th>
                  <th className="pb-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {finalizedOrders.map((order) => (
                  <tr key={order.id} className="border-t border-brand-100">
                    <td className="py-2 font-semibold text-slate-800">#{getOrderDisplayNumber(order)}</td>
                    <td className="py-2">{order.customer_name || order.customer_phone || 'Nao informado'}</td>
                    <td className="py-2">{new Date(order.closed_at || order.created_at).toLocaleString('pt-BR')}</td>
                    <td className="py-2 text-emerald-700">{formatBRL(order.total)}</td>
                  </tr>
                ))}
                {finalizedOrders.length === 0 ? (
                  <tr className="border-t border-brand-100">
                    <td colSpan={4} className="py-3 text-center text-slate-500">
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
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-2">Pedido</th>
                  <th className="pb-2">Cliente</th>
                  <th className="pb-2">Motivo</th>
                  <th className="pb-2">Valor</th>
                </tr>
              </thead>
              <tbody>
                {canceledOrders.map((order) => (
                  <tr key={order.id} className="border-t border-brand-100">
                    <td className="py-2 font-semibold text-slate-800">#{getOrderDisplayNumber(order)}</td>
                    <td className="py-2">{order.customer_name || order.customer_phone || 'Nao informado'}</td>
                    <td className="py-2">{order.canceled_reason || 'Sem motivo informado'}</td>
                    <td className="py-2 text-rose-700">{formatBRL(order.total)}</td>
                  </tr>
                ))}
                {canceledOrders.length === 0 ? (
                  <tr className="border-t border-brand-100">
                    <td colSpan={4} className="py-3 text-center text-slate-500">
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
