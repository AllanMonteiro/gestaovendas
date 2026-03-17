import React, { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer
} from 'recharts'

type DailySalesRow = {
  day: string
  total: string | number
  count: number
}

type PaymentRow = {
  payment_method?: string
  total: string
}

type ChartGranularity = 'day' | 'week' | 'month'

type ChartsProps = {
  dailySales: DailySalesRow[]
  payments: PaymentRow[]
  chartGranularity: ChartGranularity
  selectedPeriodLabel: string
}

const formatBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const paymentLabel = (method?: string) => {
  if (method === 'CARD_CREDIT') return 'Credito'
  if (method === 'CARD_DEBIT') return 'Debito'
  if (method === 'PIX') return 'PIX'
  if (method === 'CASH') return 'Dinheiro'
  return 'Cartao'
}

const paymentColors = ['#e55c2f', '#f08258', '#f7ad8a', '#ffd6bf', '#f3e2d1']

const startOfWeek = (date: Date) => {
  const copy = new Date(date)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

export const Charts: React.FC<ChartsProps> = ({ dailySales, payments, chartGranularity, selectedPeriodLabel }) => {
  const salesChartData = useMemo(() => {
    const grouped = new Map<string, { label: string; total: number; count: number; sortKey: string }>()

    dailySales.forEach((row) => {
      const date = new Date(`${row.day}T00:00:00`)
      let key = row.day
      let label = String(date.getDate()).padStart(2, '0')

      if (chartGranularity === 'week') {
        const weekStart = startOfWeek(date)
        key = weekStart.toISOString().slice(0, 10)
        label = `Sem ${weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
      }

      if (chartGranularity === 'month') {
        key = monthKey(date)
        label = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      }

      const current = grouped.get(key) ?? { label, total: 0, count: 0, sortKey: key }
      current.total += Number(row.total || 0)
      current.count += Number(row.count || 0)
      grouped.set(key, current)
    })

    return Array.from(grouped.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  }, [chartGranularity, dailySales])

  const paymentChartData = payments.map((row) => ({
    name: paymentLabel(row.payment_method),
    total: Number(row.total || 0)
  }))

  const periodTitle =
    chartGranularity === 'day'
      ? `Vendas por dia em ${selectedPeriodLabel}`
      : chartGranularity === 'week'
        ? `Vendas por semana em ${selectedPeriodLabel}`
        : `Vendas por mes em ${selectedPeriodLabel}`

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <section className="panel p-3">
        <h4 className="mb-2 px-1 text-sm font-semibold text-slate-600">{periodTitle}</h4>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={salesChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3e2d1" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip formatter={(value: number) => formatBRL(value)} />
              <Line type="monotone" dataKey="total" stroke="#e55c2f" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {salesChartData.length === 0 ? <p className="px-1 text-xs text-slate-500">Sem vendas finalizadas no periodo selecionado.</p> : null}
      </section>

      <section className="panel p-3">
        <h4 className="mb-2 px-1 text-sm font-semibold text-slate-600">
          {chartGranularity === 'day' ? 'Pedidos finalizados por dia' : chartGranularity === 'week' ? 'Pedidos finalizados por semana' : 'Pedidos finalizados por mes'}
        </h4>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={salesChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3e2d1" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#f08258" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {salesChartData.length === 0 ? <p className="px-1 text-xs text-slate-500">Nenhum pedido finalizado no periodo selecionado.</p> : null}
      </section>

      <section className="panel p-3">
        <h4 className="mb-2 px-1 text-sm font-semibold text-slate-600">Participacao por pagamento</h4>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie dataKey="total" data={paymentChartData} innerRadius={50} outerRadius={78}>
                {paymentChartData.map((entry, index) => (
                  <Cell key={entry.name} fill={paymentColors[index % paymentColors.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatBRL(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {paymentChartData.length === 0 ? <p className="px-1 text-xs text-slate-500">Sem pagamentos no periodo selecionado.</p> : null}
      </section>
    </div>
  )
}
