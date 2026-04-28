import React, { useMemo } from 'react'
import { ChartCard, ChartEmptyState, ChartPill } from '../ChartCard'
import { Badge, Card, StatCard, Table, TableBody, TableCell, TableElement, TableHead, TableHeaderCell, TableRow } from '../ui'

type Product = {
  id: number
  name: string
  active?: boolean
  stock?: string | number
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

type StockAnalyticsSectionProps = {
  products: Product[]
  orders: ClosedOrder[]
  selectedPeriodLabel: string
}

const formatQty = (value: number) =>
  value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

const parseNumber = (value: string | number | null | undefined) => Number(value || 0)

const parseDateSafe = (value?: string | null) => {
  if (!value) {
    return new Date()
  }
  return value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value)
}

const groupItemConsumptionByDay = (orders: ClosedOrder[]) => {
  const byDay = new Map<string, number>()

  orders.forEach((order) => {
    const day = parseDateSafe(order.closed_at || order.created_at).toISOString().slice(0, 10)
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
  if (stock <= 2) return 'critical'
  if (stock <= 5) return 'warning'
  return 'stable'
}

const getStockRiskBadgeVariant = (risk: StockRiskLevel) => {
  if (risk === 'critical') return 'danger' as const
  if (risk === 'warning') return 'warning' as const
  return 'success' as const
}

const getStockRiskLabel = (risk: StockRiskLevel) => {
  if (risk === 'critical') return 'Critico'
  if (risk === 'warning') return 'Atencao'
  return 'Estavel'
}

const buildStockAnalytics = (products: Product[], orders: ClosedOrder[]) => {
  const soldByProduct = new Map<number, { sold: number }>()

  orders.forEach((order) => {
    ;(order.items ?? []).forEach((item) => {
      const productId = Number(item.product || 0)
      if (!productId) return
      const current = soldByProduct.get(productId) ?? { sold: 0 }
      current.sold += parseNumber(item.qty)
      soldByProduct.set(productId, current)
    })
  })

  const activeProducts = products.filter((product) => product.active)

  const turnover: StockTurnoverPoint[] = activeProducts
    .map((product) => ({
      name: product.name,
      estoque: parseNumber(product.stock),
      saida: soldByProduct.get(product.id)?.sold || 0,
    }))
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

const HorizontalMetricBars = ({
  items,
  primaryLabel,
  secondaryLabel,
}: {
  items: StockTurnoverPoint[]
  primaryLabel: string
  secondaryLabel: string
}) => {
  const maxValue = items.reduce((best, item) => Math.max(best, item.estoque, item.saida), 0) || 1

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.name} className="rounded-2xl border border-brand-100 bg-white/78 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-semibold text-slate-900">{item.name}</p>
            <Badge variant="neutral">{formatQty(item.estoque)} em estoque</Badge>
          </div>
          <div className="mt-3 space-y-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span>{primaryLabel}</span>
                <span>{formatQty(item.saida)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#e55c2f,#f08b55)]"
                  style={{ width: `${Math.max((item.saida / maxValue) * 100, item.saida > 0 ? 6 : 0)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span>{secondaryLabel}</span>
                <span>{formatQty(item.estoque)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#facfb5,#f6b287)]"
                  style={{ width: `${Math.max((item.estoque / maxValue) * 100, item.estoque > 0 ? 6 : 0)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const SimpleBars = ({
  items,
  colorClass,
}: {
  items: Array<{ label: string; total: number }>
  colorClass: string
}) => {
  const maxValue = items.reduce((best, item) => Math.max(best, item.total), 0) || 1

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-slate-700">{item.label}</span>
            <span className="font-semibold text-slate-900">{formatQty(item.total)}</span>
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

const StockAnalyticsSection: React.FC<StockAnalyticsSectionProps> = ({ products, orders, selectedPeriodLabel }) => {
  const analytics = useMemo(() => buildStockAnalytics(products, orders), [orders, products])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Produtos ativos" value={analytics.totalActiveProducts.toLocaleString('pt-BR')} description="Base monitorada na aba de estoque" />
        <StatCard label="Estoque critico" value={analytics.criticalLowCount.toLocaleString('pt-BR')} description="Itens com ruptura ou estoque muito proximo de zero" tone="danger" />
        <StatCard label="Estoque em atencao" value={analytics.warningLowCount.toLocaleString('pt-BR')} description="Itens com saldo baixo e risco de faltar" tone="warning" />
        <StatCard label="Sem giro" value={analytics.noMovement.length.toLocaleString('pt-BR')} description="Produtos com estoque, mas sem venda no periodo" tone="accent" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Giro de estoque" description={`Estoque atual versus saida no periodo ${selectedPeriodLabel}.`} meta={<ChartPill>Estoque</ChartPill>}>
          {analytics.turnover.length === 0 ? (
            <ChartEmptyState title="Sem giro no periodo" description="Os produtos com estoque e saida aparecerao aqui assim que houver vendas." />
          ) : (
            <HorizontalMetricBars items={analytics.turnover} primaryLabel="Saida no periodo" secondaryLabel="Estoque atual" />
          )}
        </ChartCard>

        <ChartCard title="Consumo por dia" description="Saida agregada de produtos vendidos por dia." meta={<ChartPill>Consumo</ChartPill>}>
          {analytics.consumptionDaily.length === 0 ? (
            <ChartEmptyState title="Sem consumo no periodo" description="O consumo diario aparecera conforme as vendas forem registradas." />
          ) : (
            <SimpleBars
              items={analytics.consumptionDaily}
              colorClass="bg-[linear-gradient(90deg,#f08b55,#f6b287)]"
            />
          )}
        </ChartCard>

        <ChartCard title="Estoque baixo" description="Produtos ativos que precisam de atencao imediata." meta={<ChartPill>Risco</ChartPill>}>
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
                        <TableCell><Badge variant={getStockRiskBadgeVariant(risk)}>{getStockRiskLabel(risk)}</Badge></TableCell>
                        <TableCell><Badge variant={getStockRiskBadgeVariant(risk)}>{formatQty(item.stock)}</Badge></TableCell>
                        <TableCell>{formatQty(item.sold)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </TableElement>
            </Table>
          )}
        </ChartCard>

        <ChartCard title="Produtos sem giro" description="Itens com estoque atual, mas sem saida no periodo selecionado." meta={<ChartPill>Ranking</ChartPill>}>
          {analytics.noMovement.length === 0 ? (
            <ChartEmptyState title="Sem produtos parados" description="Todos os produtos ativos com estoque tiveram algum giro no periodo." />
          ) : (
            <div className="space-y-3">
              {analytics.noMovement.map((item, index) => (
                <Card key={item.id} className="p-4" tone={item.stock > 10 ? 'warning' : 'muted'}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{index + 1}. {item.name}</p>
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

export default StockAnalyticsSection
