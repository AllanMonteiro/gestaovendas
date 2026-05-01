import React, { Suspense, lazy, useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useProducts } from '../features/catalog/hooks/useProducts'
import { ChartCard, ChartEmptyState, ChartLoadingState, ChartPill } from './ChartCard'
import { Badge, Button, Card, SectionHeader } from './ui'

const FinanceAnalyticsSection = lazy(() => import('./reports/FinanceAnalyticsSection'))
const SalesAnalyticsSection = lazy(() => import('./reports/SalesAnalyticsSection'))
const StockAnalyticsSection = lazy(() => import('./reports/StockAnalyticsSection'))

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

const fetchDailySales = async (from: string, to: string) => {
  const { api } = await import('../api/client')
  const response = await api.get<DailySalesRow[]>(`/api/reports/daily_sales?from=${from}&to=${to}`)
  return response.data
}

const fetchClosedOrdersWithItems = async (from: string, to: string) => {
  const { api } = await import('../api/client')
  const response = await api.get<ClosedOrder[]>(`/api/orders/closed?from=${from}&to=${to}`)
  return response.data
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

      {activeTab === 'financeiro' ? (
        <Suspense fallback={<AnalyticsTabsSkeleton />}>
          <FinanceAnalyticsSection payments={payments} error={paymentsError} />
        </Suspense>
      ) : null}

      {activeTab === 'vendas' ? (
        salesLoading ? (
          <AnalyticsTabsSkeleton />
        ) : salesError ? (
          <ChartCard title="Vendas" description="Analise temporal do faturamento" meta={<ChartPill>Vendas</ChartPill>}>
            <ChartEmptyState title="Falha ao carregar graficos de vendas" description="Nao foi possivel montar a evolucao das vendas para o periodo selecionado." />
          </ChartCard>
        ) : (
          <Suspense fallback={<AnalyticsTabsSkeleton />}>
            <SalesAnalyticsSection
              currentDaily={currentDailyQuery.data ?? []}
              currentMonth={currentMonthQuery.data ?? []}
              previousMonth={previousMonthQuery.data ?? []}
              yearDaily={yearDailyQuery.data ?? []}
              selectedPeriodLabel={selectedPeriodLabel}
              referenceDate={referenceDate}
            />
          </Suspense>
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
          <Suspense fallback={<AnalyticsTabsSkeleton />}>
            <StockAnalyticsSection
              products={productsQuery.data ?? []}
              orders={stockOrdersQuery.data ?? []}
              selectedPeriodLabel={selectedPeriodLabel}
            />
          </Suspense>
        )
      ) : null}
    </section>
  )
}
