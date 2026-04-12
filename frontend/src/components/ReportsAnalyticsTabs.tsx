import React, { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../api/client'
import { useProducts } from '../features/catalog/hooks/useProducts'
import type { Product } from '../features/catalog/types'
import { ChartCard, ChartEmptyState, ChartLoadingState, ChartPill } from './ChartCard'
import { PaymentMethodsChart } from './PaymentMethodsChart'
import {
  Badge,
  Button,
  Card,
  SectionHeader,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableElement,
  TableHead,
  TableHeaderCell,
  TableRow,
} from './ui'

type PaymentRow = {
  payment_method?: string
  total: string
}

type DailySalesRow = {
  day: string
  total: string | number
  count: number
}

type ClosedOrderItem = {
  id: string | number
  product?: number
  product_name?: string | null
  qty?: string | number
}

type ClosedOrder = {
  id: string
  closed_at?: string | null
  created_at: string
  items?: ClosedOrderItem[]
}

type ReportsAnalyticsTabsProps = {
  fromDate: string
  toDate: string
  payments: PaymentRow[]
  paymentsError?: string
  selectedPeriodLabel: string
}

type TooltipPayload = {
  value?: number
  name?: string
  color?: string
}

type SalesPoint = {
  label: string
  total: number
}

type ComparePoint = {
  label: string
  atual: number
  anterior: number
}

type StockTurnoverPoint = {
  name: string
  estoque: number
  saida: number
}

type StockRankingItem = {
  id: number
  name: string
  stock: number
  sold: number
}

type StockRiskLevel = 'critical' | 'warning' | 'stable'

const formatBRL = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatCompactBRL = (value: number) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: Math.abs(value) >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
  })

const formatQty = (value: number) =>
  value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

const parseNumber = (value: string | number | null | undefined) => Number(value || 0)

const parseDateSafe = (value?: string | null) => {
  if (!value) {
    return new Date()
  }
  return value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value)
}

const toISODate = (date: Date) => date.toISOString().slice(0, 10)

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)
const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0)
const startOfYear = (date: Date) => new Date(date.getFullYear(), 0, 1)

const addMonths = (date: Date, diff: number) => new Date(date.getFullYear(), date.getMonth() + diff, 1)

const buildMonthDays = (date: Date) => {
  const monthStart = startOfMonth(date)
  const monthEnd = endOfMonth(date)
  const days: string[] = []
  for (let cursor = new Date(monthStart); cursor <= monthEnd; cursor.setDate(cursor.getDate() + 1)) {
    days.push(toISODate(cursor))
  }
  return days
}

const fetchDailySales = async (from: string, to: string) => {
  const response = await api.get<DailySalesRow[]>(`/api/reports/daily_sales?from=${from}&to=${to}`)
  return response.data
}

const fetchClosedOrdersWithItems = async (from: string, to: string) => {
  const response = await api.get<ClosedOrder[]>(`/api/orders/closed?from=${from}&to=${to}`)
  return response.data
}

const axisStyle = { fontSize: 12, fill: '#64748b' }

const AnalyticsTooltip = ({
  active,
  label,
  payload,
  valueFormatter,
}: {
  active?: boolean
  label?: string
  payload?: TooltipPayload[]
  valueFormatter?: (value: number, name?: string) => string
}) => {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  return (
    <div className="ui-chart-tooltip">
      {label ? <p className="ui-chart-tooltip-label">{label}</p> : null}
      <div className="mt-2 space-y-1.5">
        {payload.map((item, index) => (
          <p key={`${item.name}-${index}`} className="ui-chart-tooltip-detail">
            <span
              className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
              style={{ backgroundColor: item.color || '#e55c2f' }}
            />
            <strong className="mr-1">{item.name}:</strong>
            {valueFormatter ? valueFormatter(Number(item.value || 0), item.name) : Number(item.value || 0).toLocaleString('pt-BR')}
          </p>
        ))}
      </div>
    </div>
  )
}

const buildSalesSeries = (rows: DailySalesRow[]) =>
  rows.map((row) => ({
    day: row.day,
    label: parseDateSafe(row.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    total: parseNumber(row.total),
    count: Number(row.count || 0),
  }))

const buildCumulativeSeries = (days: string[], rows: DailySalesRow[]) => {
  const totalsMap = new Map(rows.map((row) => [row.day, parseNumber(row.total)]))
  let accumulated = 0
  return days.map((day) => {
    accumulated += totalsMap.get(day) || 0
    return {
      label: parseDateSafe(day).toLocaleDateString('pt-BR', { day: '2-digit' }),
      total: accumulated,
    }
  })
}

const buildMonthComparisonSeries = (currentRows: DailySalesRow[], previousRows: DailySalesRow[], referenceDate: Date): ComparePoint[] => {
  const currentMonthDays = buildMonthDays(referenceDate)
  const previousMonthDate = addMonths(referenceDate, -1)
  const previousMonthDays = buildMonthDays(previousMonthDate)
  const maxDays = Math.max(currentMonthDays.length, previousMonthDays.length)
  const currentMap = new Map(currentRows.map((row) => [parseDateSafe(row.day).getDate(), parseNumber(row.total)]))
  const previousMap = new Map(previousRows.map((row) => [parseDateSafe(row.day).getDate(), parseNumber(row.total)]))

  return Array.from({ length: maxDays }, (_, index) => {
    const day = index + 1
    return {
      label: String(day).padStart(2, '0'),
      atual: currentMap.get(day) || 0,
      anterior: previousMap.get(day) || 0,
    }
  })
}

const buildYearCumulativeSeries = (rows: DailySalesRow[]) => {
  const monthlyTotals = new Map<string, number>()
  rows.forEach((row) => {
    const date = parseDateSafe(row.day)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    monthlyTotals.set(key, (monthlyTotals.get(key) || 0) + parseNumber(row.total))
  })

  let accumulated = 0
  return Array.from(monthlyTotals.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, total]) => {
      accumulated += total
      const [year, month] = key.split('-').map(Number)
      const date = new Date(year, month - 1, 1)
      return {
        label: date.toLocaleDateString('pt-BR', { month: 'short' }),
        total: accumulated,
      }
    })
}

const groupItemConsumptionByDay = (orders: ClosedOrder[]) => {
  const byDay = new Map<string, number>()

  orders.forEach((order) => {
    const day = toISODate(parseDateSafe(order.closed_at || order.created_at))
    const totalQty = (order.items ?? []).reduce((sum, item) => sum + parseNumber(item.qty), 0)
    byDay.set(day, (byDay.get(day) || 0) + totalQty)
  })

  return Array.from(byDay.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, total]) => ({
      label: parseDateSafe(day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      total,
    }))
}

const getStockRiskLevel = (stock: number): StockRiskLevel => {
  if (stock <= 0) {
    return 'critical'
  }
  if (stock <= 2) {
    return 'critical'
  }
  if (stock <= 5) {
    return 'warning'
  }
  return 'stable'
}

const getStockRiskBadgeVariant = (risk: StockRiskLevel) => {
  if (risk === 'critical') {
    return 'danger' as const
  }
  if (risk === 'warning') {
    return 'warning' as const
  }
  return 'success' as const
}

const getStockRiskLabel = (risk: StockRiskLevel) => {
  if (risk === 'critical') {
    return 'Critico'
  }
  if (risk === 'warning') {
    return 'Atencao'
  }
  return 'Estavel'
}

const buildStockAnalytics = (products: Product[], orders: ClosedOrder[]) => {
  const soldByProduct = new Map<number, { name: string; sold: number }>()

  orders.forEach((order) => {
    ;(order.items ?? []).forEach((item) => {
      const productId = Number(item.product || 0)
      if (!productId) {
        return
      }
      const current = soldByProduct.get(productId) ?? {
        name: item.product_name || `Produto ${productId}`,
        sold: 0,
      }
      current.sold += parseNumber(item.qty)
      soldByProduct.set(productId, current)
    })
  })

  const activeProducts = products.filter((product) => product.active)

  const turnover: StockTurnoverPoint[] = activeProducts
    .map((product) => {
      const sold = soldByProduct.get(product.id)?.sold || 0
      return {
        name: product.name,
        estoque: parseNumber(product.stock),
        saida: sold,
      }
    })
    .filter((item) => item.estoque > 0 || item.saida > 0)
    .sort((left, right) => right.saida - left.saida)
    .slice(0, 8)

  const lowStock: StockRankingItem[] = activeProducts
    .map((product) => ({
      id: product.id,
      name: product.name,
      stock: parseNumber(product.stock),
      sold: soldByProduct.get(product.id)?.sold || 0,
    }))
    .filter((product) => product.stock <= 5)
    .sort((left, right) => left.stock - right.stock)
    .slice(0, 10)

  const noMovement: StockRankingItem[] = activeProducts
    .map((product) => ({
      id: product.id,
      name: product.name,
      stock: parseNumber(product.stock),
      sold: soldByProduct.get(product.id)?.sold || 0,
    }))
    .filter((product) => product.stock > 0 && product.sold === 0)
    .sort((left, right) => right.stock - left.stock)
    .slice(0, 10)

  return {
    consumptionDaily: groupItemConsumptionByDay(orders),
    turnover,
    lowStock,
    noMovement,
    totalActiveProducts: activeProducts.length,
    criticalLowCount: activeProducts.filter((product) => getStockRiskLevel(parseNumber(product.stock)) === 'critical').length,
    warningLowCount: activeProducts.filter((product) => getStockRiskLevel(parseNumber(product.stock)) === 'warning').length,
  }
}

const SalesChartsSection: React.FC<{
  currentDaily: DailySalesRow[]
  currentMonth: DailySalesRow[]
  previousMonth: DailySalesRow[]
  yearDaily: DailySalesRow[]
  selectedPeriodLabel: string
  referenceDate: Date
}> = ({ currentDaily, currentMonth, previousMonth, yearDaily, selectedPeriodLabel, referenceDate }) => {
  const currentSeries = useMemo(() => buildSalesSeries(currentDaily), [currentDaily])
  const monthCumulative = useMemo(() => buildCumulativeSeries(buildMonthDays(referenceDate), currentMonth), [currentMonth, referenceDate])
  const comparisonSeries = useMemo(() => buildMonthComparisonSeries(currentMonth, previousMonth, referenceDate), [currentMonth, previousMonth, referenceDate])
  const yearCumulative = useMemo(() => buildYearCumulativeSeries(yearDaily), [yearDaily])

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartCard
        title="Vendas por dia"
        description={`Faturamento diario dentro de ${selectedPeriodLabel}.`}
        meta={<ChartPill>Vendas</ChartPill>}
      >
        {currentSeries.length === 0 ? (
          <ChartEmptyState title="Sem vendas no periodo" description="Nao ha faturamento diario para exibir no intervalo atual." />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={currentSeries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 6" className="ui-chart-grid" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisStyle} />
                <YAxis tickLine={false} axisLine={false} tick={axisStyle} tickFormatter={(value) => formatCompactBRL(Number(value || 0))} />
                <Tooltip content={<AnalyticsTooltip valueFormatter={(value) => formatBRL(value)} />} />
                <Line type="monotone" dataKey="total" name="Faturamento" stroke="#e55c2f" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        title="Acumulado no mes"
        description="Soma progressiva das vendas ao longo do mes de referencia."
        meta={<ChartPill>Crescimento</ChartPill>}
      >
        {monthCumulative.length === 0 ? (
          <ChartEmptyState title="Sem acumulado mensal" description="O acumulado aparecera quando houver vendas no mes selecionado." />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthCumulative} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 6" className="ui-chart-grid" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisStyle} />
                <YAxis tickLine={false} axisLine={false} tick={axisStyle} tickFormatter={(value) => formatCompactBRL(Number(value || 0))} />
                <Tooltip content={<AnalyticsTooltip valueFormatter={(value) => formatBRL(value)} />} />
                <Line type="monotone" dataKey="total" name="Acumulado" stroke="#f08b55" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        title="Mes atual vs anterior"
        description="Comparacao diaria entre o mes de referencia e o mes imediatamente anterior."
        meta={<ChartPill>Comparativo</ChartPill>}
      >
        {comparisonSeries.length === 0 ? (
          <ChartEmptyState title="Sem comparacao mensal" description="A comparacao sera exibida assim que existirem vendas registradas." />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparisonSeries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 6" className="ui-chart-grid" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisStyle} />
                <YAxis tickLine={false} axisLine={false} tick={axisStyle} tickFormatter={(value) => formatCompactBRL(Number(value || 0))} />
                <Tooltip content={<AnalyticsTooltip valueFormatter={(value) => formatBRL(value)} />} />
                <Legend />
                <Line type="monotone" dataKey="atual" name="Mes atual" stroke="#e55c2f" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="anterior" name="Mes anterior" stroke="#facfb5" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        title="Acumulado no ano"
        description="Evolucao acumulada das vendas ao longo do ano corrente."
        meta={<ChartPill>Anual</ChartPill>}
      >
        {yearCumulative.length === 0 ? (
          <ChartEmptyState title="Sem acumulado anual" description="O grafico anual aparecera quando houver vendas ao longo do ano." />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={yearCumulative} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 6" className="ui-chart-grid" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisStyle} />
                <YAxis tickLine={false} axisLine={false} tick={axisStyle} tickFormatter={(value) => formatCompactBRL(Number(value || 0))} />
                <Tooltip content={<AnalyticsTooltip valueFormatter={(value) => formatBRL(value)} />} />
                <Line type="monotone" dataKey="total" name="Acumulado anual" stroke="#f6b287" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
    </div>
  )
}

const StockChartsSection: React.FC<{
  products: Product[]
  orders: ClosedOrder[]
  selectedPeriodLabel: string
}> = ({ products, orders, selectedPeriodLabel }) => {
  const analytics = useMemo(() => buildStockAnalytics(products, orders), [orders, products])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Produtos ativos"
          value={analytics.totalActiveProducts.toLocaleString('pt-BR')}
          description="Base monitorada na aba de estoque"
        />
        <StatCard
          label="Estoque critico"
          value={analytics.criticalLowCount.toLocaleString('pt-BR')}
          description="Itens com ruptura ou estoque muito proximo de zero"
          tone="danger"
        />
        <StatCard
          label="Estoque em atencao"
          value={analytics.warningLowCount.toLocaleString('pt-BR')}
          description="Itens com saldo baixo e risco de faltar"
          tone="warning"
        />
        <StatCard
          label="Sem giro"
          value={analytics.noMovement.length.toLocaleString('pt-BR')}
          description="Produtos com estoque, mas sem venda no periodo"
          tone="accent"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartCard
        title="Giro de estoque"
        description={`Estoque atual versus saida no periodo ${selectedPeriodLabel}.`}
        meta={<ChartPill>Estoque</ChartPill>}
      >
        {analytics.turnover.length === 0 ? (
          <ChartEmptyState title="Sem giro no periodo" description="Os produtos com estoque e saida aparecerao aqui assim que houver vendas." />
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.turnover} layout="vertical" margin={{ top: 8, right: 16, left: 28, bottom: 0 }} barGap={8}>
                <CartesianGrid horizontal strokeDasharray="3 6" className="ui-chart-grid" />
                <XAxis type="number" tickLine={false} axisLine={false} tick={axisStyle} />
                <YAxis dataKey="name" type="category" width={120} tickLine={false} axisLine={false} tick={axisStyle} />
                <Tooltip content={<AnalyticsTooltip valueFormatter={(value, name) => `${formatQty(value)} ${name === 'Saida no periodo' ? 'unid. vendidas' : 'unid. em estoque'}`} />} />
                <Legend />
                <Bar dataKey="saida" name="Saida no periodo" fill="#e55c2f" radius={[0, 8, 8, 0]} />
                <Bar dataKey="estoque" name="Estoque atual" fill="#facfb5" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        title="Consumo por dia"
        description="Saida agregada de produtos vendidos por dia."
        meta={<ChartPill>Consumo</ChartPill>}
      >
        {analytics.consumptionDaily.length === 0 ? (
          <ChartEmptyState title="Sem consumo no periodo" description="O consumo diario aparecera conforme as vendas forem registradas." />
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.consumptionDaily} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 6" className="ui-chart-grid" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisStyle} />
                <YAxis tickLine={false} axisLine={false} tick={axisStyle} tickFormatter={(value) => formatQty(Number(value || 0))} />
                <Tooltip content={<AnalyticsTooltip valueFormatter={(value) => `${formatQty(value)} unid.`} />} />
                <Line type="monotone" dataKey="total" name="Saida de produtos" stroke="#f08b55" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        title="Estoque baixo"
        description="Produtos ativos que precisam de atencao imediata."
        meta={<ChartPill>Risco</ChartPill>}
      >
        {analytics.lowStock.length === 0 ? (
          <ChartEmptyState title="Sem itens com estoque baixo" description="Nenhum produto ativo esta abaixo do patamar visual adotado para alerta." />
        ) : (
          <Table>
            <TableElement>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Produto</TableHeaderCell>
                  <TableHeaderCell>Prioridade</TableHeaderCell>
                  <TableHeaderCell>Estoque</TableHeaderCell>
                  <TableHeaderCell>Saida no periodo</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {analytics.lowStock.map((item) => {
                  const risk = getStockRiskLevel(item.stock)
                  return (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>
                      <Badge variant={getStockRiskBadgeVariant(risk)}>{getStockRiskLabel(risk)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStockRiskBadgeVariant(risk)}>{formatQty(item.stock)}</Badge>
                    </TableCell>
                    <TableCell>{formatQty(item.sold)}</TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </TableElement>
          </Table>
        )}
      </ChartCard>

      <ChartCard
        title="Produtos sem giro"
        description="Itens com estoque atual, mas sem saida no periodo selecionado."
        meta={<ChartPill>Ranking</ChartPill>}
      >
        {analytics.noMovement.length === 0 ? (
          <ChartEmptyState title="Sem produtos parados" description="Todos os produtos ativos com estoque tiveram algum giro no periodo." />
        ) : (
          <div className="space-y-3">
            {analytics.noMovement.map((item, index) => (
              <Card key={item.id} className="p-4" tone={item.stock > 10 ? 'warning' : 'muted'}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {index + 1}. {item.name}
                    </p>
                    <p className="text-xs text-slate-500">Sem vendas no intervalo atual</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.stock > 10 ? <Badge variant="warning">Capital parado</Badge> : null}
                    <Badge variant="neutral">{formatQty(item.stock)} em estoque</Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </ChartCard>
      </div>
    </div>
  )
}

const AnalyticsTabsSkeleton: React.FC = () => (
  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
    {Array.from({ length: 4 }).map((_, index) => (
      <ChartCard key={index} title="Carregando..." description="Preparando a analise temporal" meta={<ChartPill>Analytics</ChartPill>}>
        <ChartLoadingState />
      </ChartCard>
    ))}
  </div>
)

export const ReportsAnalyticsTabs: React.FC<ReportsAnalyticsTabsProps> = ({
  fromDate,
  toDate,
  payments,
  paymentsError,
  selectedPeriodLabel,
}) => {
  const [activeTab, setActiveTab] = useState<'financeiro' | 'vendas' | 'estoque'>('vendas')

  const referenceDate = useMemo(() => parseDateSafe(toDate || fromDate), [fromDate, toDate])
  const currentMonthStart = toISODate(startOfMonth(referenceDate))
  const currentMonthEnd = toISODate(endOfMonth(referenceDate))
  const previousMonthBase = addMonths(referenceDate, -1)
  const previousMonthStart = toISODate(startOfMonth(previousMonthBase))
  const previousMonthEnd = toISODate(endOfMonth(previousMonthBase))
  const currentYearStart = toISODate(startOfYear(referenceDate))

  const productsQuery = useProducts({ enabled: activeTab === 'estoque' })

  const [currentDailyQuery, currentMonthQuery, previousMonthQuery, yearDailyQuery, stockOrdersQuery] = useQueries({
    queries: [
      {
        queryKey: ['reports', 'daily-sales', 'period', fromDate, toDate],
        queryFn: () => fetchDailySales(fromDate, toDate),
        staleTime: 30_000,
        enabled: activeTab === 'vendas',
      },
      {
        queryKey: ['reports', 'daily-sales', 'month', currentMonthStart, currentMonthEnd],
        queryFn: () => fetchDailySales(currentMonthStart, currentMonthEnd),
        staleTime: 30_000,
        enabled: activeTab === 'vendas',
      },
      {
        queryKey: ['reports', 'daily-sales', 'previous-month', previousMonthStart, previousMonthEnd],
        queryFn: () => fetchDailySales(previousMonthStart, previousMonthEnd),
        staleTime: 30_000,
        enabled: activeTab === 'vendas',
      },
      {
        queryKey: ['reports', 'daily-sales', 'year', currentYearStart, toDate],
        queryFn: () => fetchDailySales(currentYearStart, toDate),
        staleTime: 30_000,
        enabled: activeTab === 'vendas',
      },
      {
        queryKey: ['reports', 'stock-orders', fromDate, toDate],
        queryFn: () => fetchClosedOrdersWithItems(fromDate, toDate),
        staleTime: 30_000,
        enabled: activeTab === 'estoque',
      },
    ],
  })

  const salesLoading = currentDailyQuery.isLoading || currentMonthQuery.isLoading || previousMonthQuery.isLoading || yearDailyQuery.isLoading
  const salesError = currentDailyQuery.isError || currentMonthQuery.isError || previousMonthQuery.isError || yearDailyQuery.isError

  const stockLoading = productsQuery.isLoading || stockOrdersQuery.isLoading
  const stockError = productsQuery.isError || stockOrdersQuery.isError

  return (
    <section className="mx-auto max-w-7xl space-y-4">
      <Card className="p-5 sm:p-6" tone="accent">
        <SectionHeader
          title="Analytics Gerencial"
          description="Acompanhe crescimento de vendas e comportamento do estoque com leitura temporal mais clara."
          meta={<Badge variant="brand">{selectedPeriodLabel}</Badge>}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant={activeTab === 'financeiro' ? 'primary' : 'secondary'} size="sm" onClick={() => setActiveTab('financeiro')}>Financeiro</Button>
              <Button variant={activeTab === 'vendas' ? 'primary' : 'secondary'} size="sm" onClick={() => setActiveTab('vendas')}>Vendas</Button>
              <Button variant={activeTab === 'estoque' ? 'primary' : 'secondary'} size="sm" onClick={() => setActiveTab('estoque')}>Estoque</Button>
            </div>
          }
        />
      </Card>

      {activeTab === 'financeiro' ? <PaymentMethodsChart payments={payments} error={paymentsError} /> : null}

      {activeTab === 'vendas' ? (
        salesLoading ? (
          <AnalyticsTabsSkeleton />
        ) : salesError ? (
          <ChartCard title="Vendas" description="Analise temporal do faturamento" meta={<ChartPill>Vendas</ChartPill>}>
            <ChartEmptyState title="Falha ao carregar graficos de vendas" description="Nao foi possivel montar a evolucao das vendas para o periodo selecionado." />
          </ChartCard>
        ) : (
          <SalesChartsSection
            currentDaily={currentDailyQuery.data ?? []}
            currentMonth={currentMonthQuery.data ?? []}
            previousMonth={previousMonthQuery.data ?? []}
            yearDaily={yearDailyQuery.data ?? []}
            selectedPeriodLabel={selectedPeriodLabel}
            referenceDate={referenceDate}
          />
        )
      ) : null}

      {activeTab === 'estoque' ? (
        stockLoading ? (
          <AnalyticsTabsSkeleton />
        ) : stockError ? (
          <ChartCard title="Estoque" description="Analise operacional dos produtos" meta={<ChartPill>Estoque</ChartPill>}>
            <ChartEmptyState title="Falha ao carregar graficos de estoque" description="Nao foi possivel analisar giro e consumo do estoque com os dados atuais." />
          </ChartCard>
        ) : (
          <StockChartsSection
            products={productsQuery.data ?? []}
            orders={stockOrdersQuery.data ?? []}
            selectedPeriodLabel={selectedPeriodLabel}
          />
        )
      ) : null}
    </section>
  )
}
