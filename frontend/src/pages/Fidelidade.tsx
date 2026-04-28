import React, { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  SectionHeader,
  StatCard,
} from '../components/ui'

type CustomerResponse = {
  customer: {
    id: number
    name?: string | null
    last_name?: string | null
    neighborhood?: string | null
    phone: string
  }
  account: {
    id: number
    points_balance: number
  }
}

type LoyaltyMove = {
  id: number
  points: number
  type: string
  reason: string
  created_at: string
}

const normalizePhone = (value: string) => value.replace(/\D/g, '')

const formatMoveDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

const getApiErrorText = (error: unknown, fallback: string) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail === 'string'
  ) {
    return (error as { response: { data: { detail: string } } }).response.data.detail
  }
  return fallback
}

const Fidelidade: React.FC = () => {
  const [phone, setPhone] = useState('')
  const [points, setPoints] = useState('10')
  const [reason, setReason] = useState('Movimentacao manual')
  const [customerData, setCustomerData] = useState<CustomerResponse | null>(null)
  const [moves, setMoves] = useState<LoyaltyMove[]>([])
  const [feedback, setFeedback] = useState('')
  const [loadingCustomer, setLoadingCustomer] = useState(false)
  const [loadingMove, setLoadingMove] = useState(false)

  const loadCustomer = useCallback(async (targetPhone?: string, options?: { silent?: boolean }) => {
    const selectedPhone = normalizePhone((targetPhone || phone).trim())
    if (!selectedPhone) {
      setFeedback('Informe o telefone.')
      return
    }
    setLoadingCustomer(true)
    try {
      const [customerResp, movesResp] = await Promise.all([
        api.get<CustomerResponse>(`/api/loyalty/customer?phone=${encodeURIComponent(selectedPhone)}`),
        api.get<LoyaltyMove[]>(`/api/loyalty/moves?phone=${encodeURIComponent(selectedPhone)}`)
      ])
      setCustomerData(customerResp.data)
      setMoves(movesResp.data)
      setPhone(selectedPhone)
      if (!options?.silent) {
        setFeedback('Cliente carregado.')
      }
    } catch (error: unknown) {
      setCustomerData(null)
      setMoves([])
      setFeedback(getApiErrorText(error, 'Cliente nao encontrado para este telefone.'))
    } finally {
      setLoadingCustomer(false)
    }
  }, [phone])

  useEffect(() => {
    if (!customerData?.customer?.phone) {
      return
    }
    const run = () => {
      if (document.visibilityState === 'hidden') {
        return
      }
      void loadCustomer(customerData.customer.phone, { silent: true })
    }
    const timer = window.setInterval(() => {
      run()
    }, 30000)
    document.addEventListener('visibilitychange', run)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', run)
    }
  }, [customerData?.customer?.phone, loadCustomer])

  const handleMove = async (type: 'earn' | 'redeem') => {
    const normalizedPhone = normalizePhone(phone.trim())
    if (!normalizedPhone) {
      setFeedback('Informe o telefone do cliente.')
      return
    }
    const numericPoints = Number(points)
    if (!Number.isFinite(numericPoints) || numericPoints <= 0) {
      setFeedback('Pontos invalidos.')
      return
    }
    setLoadingMove(true)
    try {
      await api.post(`/api/loyalty/${type}`, {
        phone: normalizedPhone,
        points: numericPoints,
        reason: reason.trim() || 'Movimentacao no painel de fidelidade'
      })
      await loadCustomer(normalizedPhone, { silent: true })
      setFeedback(type === 'earn' ? 'Pontos adicionados.' : 'Pontos resgatados.')
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao registrar movimentacao de pontos.'))
    } finally {
      setLoadingMove(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Relacionamento"
        title="Fidelidade"
        description="Acompanhe saldo, movimente pontos e consulte o historico do cliente em uma tela mais clara para operacao."
        meta={
          <div className="flex flex-wrap gap-2">
            <Badge variant={customerData ? 'success' : 'neutral'}>
              {customerData ? 'Cliente carregado' : 'Aguardando busca'}
            </Badge>
            <Badge variant={moves.length > 0 ? 'brand' : 'neutral'}>
              {moves.length} movimentacao{moves.length === 1 ? '' : 'oes'}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="space-y-4 p-5">
          <SectionHeader
            title="Buscar cliente"
            description="Informe o telefone para carregar saldo e extrato automaticamente."
            actions={
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void loadCustomer()} disabled={loadingCustomer} variant="primary">
                  {loadingCustomer ? 'Buscando...' : 'Buscar'}
                </Button>
                <Button
                  onClick={() => void loadCustomer(phone, { silent: true })}
                  disabled={loadingCustomer || !phone.trim()}
                  variant="secondary"
                >
                  Atualizar saldo
                </Button>
              </div>
            }
          />
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Telefone com DDD"
              label="Telefone"
            />
            <div className="hidden md:block" />
          </div>

          {feedback ? (
            <Card tone="accent" className="p-4">
              <p className="text-sm text-slate-700">{feedback}</p>
            </Card>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <StatCard
              label="Saldo atual"
              value={`${customerData?.account.points_balance ?? 0} pontos`}
              description={customerData ? 'Atualizado em tempo real enquanto a tela estiver aberta.' : 'Nenhum cliente carregado.'}
              tone="accent"
            />
            <StatCard
              label="Cliente"
              value={customerData ? customerData.customer.name || 'Cliente' : 'Aguardando busca'}
              description={
                customerData
                  ? `${customerData.customer.last_name || ''} ${customerData.customer.phone}`.trim()
                  : 'Busque por telefone para liberar a movimentacao.'
              }
            />
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <SectionHeader
            title="Movimentar pontos"
            description="Ajuste saldo manualmente para campanhas, cortesias ou resgates."
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              placeholder="Pontos"
              label="Quantidade"
              inputMode="numeric"
            />
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Motivo"
              label="Motivo"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleMove('earn')} disabled={loadingMove} variant="success">
              {loadingMove ? 'Processando...' : 'Adicionar pontos'}
            </Button>
            <Button onClick={() => void handleMove('redeem')} disabled={loadingMove} variant="warning">
              {loadingMove ? 'Processando...' : 'Resgatar pontos'}
            </Button>
          </div>
          <Card tone="muted" className="p-4">
            <p className="text-sm leading-6 text-slate-600">
              O saldo e o extrato sao atualizados novamente em segundo plano a cada 30 segundos enquanto esta aba estiver visivel.
            </p>
          </Card>
        </Card>
      </div>

      <Card className="space-y-4 p-5">
        <SectionHeader
          title="Extrato"
          description="Historico recente de creditos e resgates do cliente selecionado."
          meta={
            customerData ? (
              <Badge variant="info">
                {customerData.customer.name || 'Cliente'} {customerData.customer.last_name || ''}
              </Badge>
            ) : null
          }
        />
        {moves.length === 0 ? (
          <EmptyState
            title="Sem movimentacoes ainda"
            description={
              customerData
                ? 'Este cliente ainda nao possui historico de pontos.'
                : 'Busque um cliente para visualizar o extrato de fidelidade.'
            }
          />
        ) : (
          <div className="grid gap-3">
            {moves.map((move) => {
              const isPositive = move.points >= 0
              return (
                <div
                  key={move.id}
                  className="flex flex-col gap-3 rounded-2xl border border-white/70 bg-white/80 px-4 py-4 shadow-sm shadow-brand-100/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={isPositive ? 'success' : 'warning'}>
                        {move.type === 'earn' ? 'Credito' : move.type === 'redeem' ? 'Resgate' : move.type}
                      </Badge>
                      <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                        {formatMoveDate(move.created_at)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-800">{move.reason}</p>
                  </div>
                  <p className={`text-lg font-semibold ${isPositive ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {move.points > 0 ? '+' : ''}
                    {move.points}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

export default Fidelidade
