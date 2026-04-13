import React, { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartCard, ChartEmptyState, ChartLegend, ChartPill } from './ChartCard'

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

type SalesPoint = {
  label: string
  total: number
  count: number
  sortKey: string
}

type TooltipEntry = {
  value?: number
  name?: string
  color?: string
}

const formatBRL = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatCompactBRL = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: Math.abs(value) >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
  })

const formatCompactCount = (value: number) =>
  value.toLocaleString('pt-BR', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  })

const paymentLabel = (method?: string) => {
  if (method === 'CARD_CREDIT') return 'Cartao credito'
  if (method === 'CARD_DEBIT') return 'Cartao debito'
  if (method === 'CARD') return 'Cartao'
  if (method === 'PIX') return 'PIX'
  if (method === 'CASH') return 'Dinheiro'
  return 'Prazo'
}

const paymentPalette = ['#e55c2f', '#f08b55', '#f6b287', '#facfb5', '#fde6d7']
const axisStyle = { fontSize: 12, fill: '#64748b' }

const startOfWeek = (date: Date) => {
  const copy = new Date(date)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const ChartTooltip = ({
  active,
  label,
  payload,
  formatter,
}: {
  active?: boolean
  label?: string
  payload?: TooltipEntry[]
  formatter?: (value: number) => string
}) => {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const first = payload[0]
  const value = Number(first?.value || 0)

  return (
    <div className="ui-chart-tooltip">
      {label ? <p className="ui-chart-tooltip-label">{label}</p> : null}
      <p className="ui-chart-tooltip-value">{formatter ? formatter(value) : value.toLocaleString('pt-BR')}</p>
      {first?.name ? (
        <p className="ui-chart-tooltip-detail">
          <span
            className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
            style={{ backgroundColor: first.color || '#e55c2f' }}
          />
          {first.name}
        </p>
      ) : null}
    </div>
  )
}

export const Charts: React.FC<ChartsProps> = ({
  dailySales,
  payments,
  chartGranularity,
  selectedPeriodLabel,
}) => {
  const salesChartData = useMemo<SalesPoint[]>(() => {
    const grouped = new Map<string, SalesPoint>()

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

  const paymentChartData = useMemo(() => {
    const rows = payments
      .map((row) => ({
        name: paymentLabel(row.payment_method),
        total: Number(row.total || 0),
      }))
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total)

    if (rows.length <= 4) {
      return rows
    }

    const topRows = rows.slice(0, 4)
    const othersTotal = rows.slice(4).reduce((total, row) => total + row.total, 0)
    return [...topRows, { name: 'Outros', total: othersTotal }]
  }, [payments])

  const revenueTotal = salesChartData.reduce((total, row) => total + row.total, 0)
  const ordersTotal = salesChartData.reduce((total, row) => total + row.count, 0)
  const paymentTotal = paymentChartData.reduce((total, row) => total + row.total, 0)
  const peakRevenue = salesChartData.reduce<SalesPoint | null>(
    (best, row) => (!best || row.total > best.total ? row : best),
    null
  )
  const peakOrders = salesChartData.reduce<SalesPoint | null>(
    (best, row) => (!best || row.count > best.count ? row : best),
    null
  )

  const paymentLegendItems = paymentChartData.map((row, index) => ({
    label: row.name,
    value:
      paymentTotal > 0
        ? `${formatBRL(row.total)} | ${Math.round((row.total / paymentTotal) * 100)}%`
        : formatBRL(row.total),
    color: paymentPalette[index % paymentPalette.length],
  }))

  const periodTitle =
    chartGranularity === 'day'
      ? 'Vendas por dia'
      : chartGranularity === 'week'
        ? 'Vendas por semana'
        : 'Vendas por mes'

  const orderVolumeTitle =
    chartGranularity === 'day'
      ? 'Pedidos finalizados por dia'
      : chartGranularity === 'week'
        ? 'Pedidos finalizados por semana'
        : 'Pedidos finalizados por mes'

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <ChartCard
        title={periodTitle}
        description={`Receita consolidada em ${selectedPeriodLabel}.`}
        meta={<ChartPill>Receita</ChartPill>}
        actions={<ChartPill>{formatBRL(revenueTotal)}</ChartPill>}
        footer={
          salesChartData.length > 0 ? (
            <ChartLegend
              items={[
                { label: 'Faturamento acumulado', value: formatBRL(revenueTotal), color: '#e55c2f' },
                {
                  label: peakRevenue ? `Pico em ${peakRevenue.label}` : 'Pico do periodo',
                  value: peakRevenue ? formatBRL(peakRevenue.total) : formatBRL(0),
                  color: '#f6b287',
                },
              ]}
            />
          ) : null
        }
      >
        {salesChartData.length === 0 ? (
          <ChartEmptyState
            title="Sem vendas no periodo"
            description="Assim que houver vendas finalizadas no intervalo filtrado, o grafico sera preenchido aqui."
          />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesChartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e55c2f" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#e55c2f" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 6" className="ui-chart-grid" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisStyle} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={axisStyle}
                  tickFormatter={(value) => formatCompactBRL(Number(value || 0))}
                />
                <Tooltip content={<ChartTooltip formatter={formatBRL} />} cursor={{ stroke: '#e7c9b4', strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="total"
                  name="Faturamento"
                  stroke="#e55c2f"
                  fill="url(#salesGradient)"
                  strokeWidth={3}
                  activeDot={{ r: 5, fill: '#e55c2f', stroke: '#fff7ed', strokeWidth: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        title={orderVolumeTitle}
        description="Volume de pedidos finalizados no mesmo intervalo."
        meta={<ChartPill>Operacao</ChartPill>}
        actions={<ChartPill>{`${formatCompactCount(ordersTotal)} pedidos`}</ChartPill>}
        footer={
          salesChartData.length > 0 ? (
            <ChartLegend
              items={[
                { label: 'Pedidos finalizados', value: `${ordersTotal.toLocaleString('pt-BR')} pedidos`, color: '#f08b55' },
                {
                  label: peakOrders ? `Maior volume em ${peakOrders.label}` : 'Maior volume',
                  value: peakOrders ? `${peakOrders.count.toLocaleString('pt-BR')} pedidos` : '0 pedidos',
                  color: '#facfb5',
                },
              ]}
            />
          ) : null
        }
      >
        {salesChartData.length === 0 ? (
          <ChartEmptyState
            title="Sem pedidos finalizados"
            description="O volume de pedidos aparecera aqui quando houver movimentacao no periodo."
          />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesChartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} strokeDasharray="3 6" className="ui-chart-grid" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisStyle} />
                <YAxis tickLine={false} axisLine={false} tick={axisStyle} allowDecimals={false} />
                <Tooltip
                  content={<ChartTooltip formatter={(value) => `${value.toLocaleString('pt-BR')} pedido(s)`} />}
                  cursor={{ fill: 'rgba(229, 92, 47, 0.06)' }}
                />
                <Bar dataKey="count" name="Pedidos finalizados" fill="#f08b55" radius={[10, 10, 4, 4]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        title="Participacao por pagamento"
        description="Distribuicao do faturamento por metodo de pagamento."
        meta={<ChartPill>Mix</ChartPill>}
        actions={<ChartPill>{formatBRL(paymentTotal)}</ChartPill>}
        footer={paymentChartData.length > 0 ? <ChartLegend items={paymentLegendItems} /> : null}
      >
        {paymentChartData.length === 0 ? (
          <ChartEmptyState
            title="Sem pagamentos no periodo"
            description="A participacao por pagamento sera exibida assim que existirem vendas para o filtro atual."
          />
        ) : (
          <div className="relative h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<ChartTooltip formatter={formatBRL} />} />
                <Pie
                  dataKey="total"
                  data={paymentChartData}
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={88}
                  paddingAngle={2}
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth={2}
                >
                  {paymentChartData.map((entry, index) => (
                    <Cell key={entry.name} fill={paymentPalette[index % paymentPalette.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Total</span>
              <span className="mt-2 text-lg font-semibold tracking-tight text-slate-900">{formatBRL(paymentTotal)}</span>
              <span className="mt-1 text-xs text-slate-500">{paymentChartData.length} categoria(s)</span>
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  )
}
