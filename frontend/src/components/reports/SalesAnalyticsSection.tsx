import React, { useMemo } from 'react'
import { ChartCard, ChartEmptyState, ChartPill } from '../ChartCard'

type DailySalesRow = {
  day: string
  total: string | number
  count: number
}

type MonthComparisonPoint = {
  label: string
  total: number
  period: 'Mes atual' | 'Mes anterior'
}

type SalesAnalyticsSectionProps = {
  currentDaily: DailySalesRow[]
  currentMonth: DailySalesRow[]
  previousMonth: DailySalesRow[]
  yearDaily: DailySalesRow[]
  selectedPeriodLabel: string
  referenceDate: Date
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

const parseNumber = (value: string | number | null | undefined) => Number(value || 0)

const parseDateSafe = (value?: string | null) => {
  if (!value) {
    return new Date()
  }
  return value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value)
}

const buildMonthDays = (date: Date) => {
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1)
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  const days: string[] = []
  for (const cursor = new Date(monthStart); cursor <= monthEnd; cursor.setDate(cursor.getDate() + 1)) {
    days.push(cursor.toISOString().slice(0, 10))
  }
  return days
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

const buildMonthComparisonSeries = (
  currentRows: DailySalesRow[],
  previousRows: DailySalesRow[],
  referenceDate: Date
): MonthComparisonPoint[] => {
  const previousMonthDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1)
  const currentTotal = currentRows.reduce((sum, row) => sum + parseNumber(row.total), 0)
  const previousTotal = previousRows.reduce((sum, row) => sum + parseNumber(row.total), 0)

  return [
    {
      label: previousMonthDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      total: previousTotal,
      period: 'Mes anterior',
    },
    {
      label: referenceDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      total: currentTotal,
      period: 'Mes atual',
    },
  ]
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

const BarList = ({
  items,
  colorClass,
  formatter,
  maxItems = items.length,
}: {
  items: Array<{ label: string; total: number }>
  colorClass: string
  formatter: (value: number) => string
  maxItems?: number
}) => {
  const visibleItems = items.slice(-maxItems)
  const maxValue = visibleItems.reduce((best, item) => Math.max(best, item.total), 0) || 1

  return (
    <div className="space-y-3">
      {visibleItems.map((item) => (
        <div key={item.label} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-slate-700">{item.label}</span>
            <span className="font-semibold text-slate-900">{formatter(item.total)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${colorClass}`}
              style={{ width: `${Math.max((item.total / maxValue) * 100, item.total > 0 ? 6 : 0)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

const SalesAnalyticsSection: React.FC<SalesAnalyticsSectionProps> = ({
  currentDaily,
  currentMonth,
  previousMonth,
  yearDaily,
  selectedPeriodLabel,
  referenceDate,
}) => {
  const currentSeries = useMemo(() => buildSalesSeries(currentDaily), [currentDaily])
  const monthCumulative = useMemo(() => buildCumulativeSeries(buildMonthDays(referenceDate), currentMonth), [currentMonth, referenceDate])
  const comparisonSeries = useMemo(() => buildMonthComparisonSeries(currentMonth, previousMonth, referenceDate), [currentMonth, previousMonth, referenceDate])
  const yearCumulative = useMemo(() => buildYearCumulativeSeries(yearDaily), [yearDaily])

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartCard title="Vendas por dia" description={`Faturamento diario dentro de ${selectedPeriodLabel}.`} meta={<ChartPill>Vendas</ChartPill>}>
        {currentSeries.length === 0 ? (
          <ChartEmptyState title="Sem vendas no periodo" description="Nao ha faturamento diario para exibir no intervalo atual." />
        ) : (
          <BarList items={currentSeries.map((item) => ({ label: item.label, total: item.total }))} colorClass="bg-[linear-gradient(90deg,#e55c2f,#f08b55)]" formatter={formatCompactBRL} maxItems={8} />
        )}
      </ChartCard>

      <ChartCard title="Acumulado no mes" description="Soma progressiva das vendas ao longo do mes de referencia." meta={<ChartPill>Crescimento</ChartPill>}>
        {monthCumulative.length === 0 ? (
          <ChartEmptyState title="Sem acumulado mensal" description="O acumulado aparecera quando houver vendas no mes selecionado." />
        ) : (
          <BarList items={monthCumulative.map((item) => ({ label: item.label, total: item.total }))} colorClass="bg-[linear-gradient(90deg,#f08b55,#f6b287)]" formatter={formatCompactBRL} maxItems={8} />
        )}
      </ChartCard>

      <ChartCard title="Mes atual vs anterior" description="Comparacao do faturamento total entre o mes de referencia e o mes imediatamente anterior." meta={<ChartPill>Comparativo</ChartPill>}>
        {comparisonSeries.length === 0 ? (
          <ChartEmptyState title="Sem comparacao mensal" description="A comparacao sera exibida assim que existirem vendas registradas." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {comparisonSeries.map((item) => {
              const maxValue = Math.max(...comparisonSeries.map((entry) => entry.total), 1)
              return (
                <div key={item.label} className="rounded-2xl border border-brand-100 bg-white/78 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{item.period}</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-1 text-sm text-slate-500">{formatBRL(item.total)}</p>
                  <div className="mt-4 h-28 rounded-2xl bg-slate-50 p-3 flex items-end">
                    <div
                      className={`w-full rounded-xl ${item.period === 'Mes atual' ? 'bg-[linear-gradient(180deg,#e55c2f,#f08b55)]' : 'bg-[linear-gradient(180deg,#facfb5,#f6b287)]'}`}
                      style={{ height: `${Math.max((item.total / maxValue) * 100, item.total > 0 ? 12 : 0)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ChartCard>

      <ChartCard title="Acumulado no ano" description="Evolucao acumulada das vendas ao longo do ano corrente." meta={<ChartPill>Anual</ChartPill>}>
        {yearCumulative.length === 0 ? (
          <ChartEmptyState title="Sem acumulado anual" description="O grafico anual aparecera quando houver vendas ao longo do ano." />
        ) : (
          <BarList items={yearCumulative.map((item) => ({ label: item.label, total: item.total }))} colorClass="bg-[linear-gradient(90deg,#f6b287,#facfb5)]" formatter={formatCompactBRL} maxItems={12} />
        )}
      </ChartCard>
    </div>
  )
}

export default SalesAnalyticsSection
