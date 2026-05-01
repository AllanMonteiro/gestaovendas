import React, { useMemo } from 'react'
import { ChartCard, ChartEmptyState, ChartPill } from './ChartCard'
import { Badge, Card } from './ui'

type PaymentRow = {
  payment_method?: string
  total: string
}

type PaymentMethodsChartProps = {
  payments: PaymentRow[]
  error?: string
}

type PaymentBucket = {
  label: 'Pix' | 'Cartao credito' | 'Cartao debito' | 'Cartao' | 'Dinheiro' | 'Prazo'
  total: number
  color: string
  percent: number
}

const formatBRL = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const paymentPalette: Record<PaymentBucket['label'], string> = {
  Pix: '#e55c2f',
  'Cartao credito': '#f08b55',
  'Cartao debito': '#f6b287',
  Cartao: '#f3c39d',
  Dinheiro: '#facfb5',
  Prazo: '#fde6d7',
}

const getPaymentBucket = (method?: string): PaymentBucket['label'] => {
  const normalized = String(method || '').toUpperCase()
  if (normalized === 'PIX') return 'Pix'
  if (normalized === 'CASH') return 'Dinheiro'
  if (normalized === 'CARD_CREDIT') return 'Cartao credito'
  if (normalized === 'CARD_DEBIT') return 'Cartao debito'
  if (normalized === 'CARD') return 'Cartao'
  return 'Prazo'
}

export const PaymentMethodsChart: React.FC<PaymentMethodsChartProps> = ({ payments, error }) => {
  const paymentData = useMemo(() => {
    const base: PaymentBucket[] = [
      { label: 'Pix', total: 0, color: paymentPalette.Pix, percent: 0 },
      { label: 'Cartao credito', total: 0, color: paymentPalette['Cartao credito'], percent: 0 },
      { label: 'Cartao debito', total: 0, color: paymentPalette['Cartao debito'], percent: 0 },
      { label: 'Cartao', total: 0, color: paymentPalette.Cartao, percent: 0 },
      { label: 'Dinheiro', total: 0, color: paymentPalette.Dinheiro, percent: 0 },
      { label: 'Prazo', total: 0, color: paymentPalette.Prazo, percent: 0 },
    ]

    payments.forEach((row) => {
      const bucket = getPaymentBucket(row.payment_method)
      const target = base.find((item) => item.label === bucket)
      if (target) {
        target.total += Number(row.total || 0)
      }
    })

    const total = base.reduce((sum, item) => sum + item.total, 0)
    const ordered = [...base]
      .map((item) => ({
        ...item,
        percent: total > 0 ? Math.round((item.total / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)

    return {
      total,
      items: ordered,
      chartItems: ordered.filter((item) => item.total > 0),
    }
  }, [payments])

  if (error) {
    return (
      <ChartCard
        title="Formas de pagamento"
        description="Distribuicao das vendas no periodo"
        meta={<ChartPill>Financeiro</ChartPill>}
      >
        <ChartEmptyState
          title="Nao foi possivel carregar o financeiro"
          description={error}
        />
      </ChartCard>
    )
  }

  if (paymentData.chartItems.length === 0) {
    return (
      <ChartCard
        title="Formas de pagamento"
        description="Distribuicao das vendas no periodo"
        meta={<ChartPill>Financeiro</ChartPill>}
      >
        <ChartEmptyState
          title="Sem vendas no periodo"
          description="Assim que houver vendas finalizadas, a distribuicao por forma de pagamento aparecera aqui."
        />
      </ChartCard>
    )
  }

  return (
    <ChartCard
      title="Formas de pagamento"
      description="Distribuicao das vendas no periodo"
      meta={<ChartPill>Financeiro</ChartPill>}
      actions={<ChartPill>{formatBRL(paymentData.total)}</ChartPill>}
    >
      <div className="grid grid-cols-1 items-center gap-6 xl:grid-cols-[minmax(320px,1fr)_minmax(280px,0.95fr)]">
        <div className="mx-auto flex w-full max-w-[26rem] justify-center">
          <div className="relative flex h-80 w-full items-center justify-center">
            <div
              className="relative h-56 w-56 rounded-full shadow-sm"
              style={{
                background: `conic-gradient(${paymentData.chartItems
                  .map((item, index, items) => {
                    const start = items.slice(0, index).reduce((sum, entry) => sum + entry.percent, 0)
                    const end = start + item.percent
                    return `${item.color} ${start}% ${end}%`
                  })
                  .join(', ')})`,
              }}
            />
            <div className="absolute h-32 w-32 rounded-full bg-white shadow-inner" />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Total</span>
              <span className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{formatBRL(paymentData.total)}</span>
              <span className="mt-2 text-xs text-slate-500">Vendas distribuidas por pagamento</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {paymentData.items.map((item) => (
            <Card key={item.label} className="p-4" tone={item.total > 0 ? 'default' : 'muted'}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.percent}% do total</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{formatBRL(item.total)}</p>
                  <Badge variant={item.total > 0 ? 'neutral' : 'warning'}>{item.total > 0 ? 'Ativo' : 'Sem vendas'}</Badge>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${item.percent}%`, backgroundColor: item.color }}
                />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </ChartCard>
  )
}
