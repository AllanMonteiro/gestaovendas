import React, { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'

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
    const timer = window.setInterval(() => {
      void loadCustomer(customerData.customer.phone, { silent: true })
    }, 10000)
    return () => window.clearInterval(timer)
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
    <div className="space-y-4">
      <div className="panel p-4">
        <h2 className="font-semibold">Buscar Cliente</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="flex-1 border border-brand-100 rounded-lg px-3 py-2"
            placeholder="Telefone"
          />
          <button
            onClick={() => void loadCustomer()}
            disabled={loadingCustomer}
            className="px-3 py-2 rounded-lg bg-brand-600 text-white disabled:opacity-60"
          >
            {loadingCustomer ? 'Buscando...' : 'Buscar'}
          </button>
          <button
            onClick={() => void loadCustomer(phone, { silent: true })}
            disabled={loadingCustomer || !phone.trim()}
            className="px-3 py-2 rounded-lg border border-brand-200 text-brand-700 disabled:opacity-60"
          >
            Atualizar saldo
          </button>
        </div>
      </div>

      <div className="panel p-4">
        <h2 className="font-semibold">Saldo</h2>
        <div className="mt-2 text-xl">{customerData ? `${customerData.account.points_balance} pontos` : '0 pontos'}</div>
        <p className="mt-1 text-sm text-slate-500">
          {customerData
            ? `${customerData.customer.name || 'Cliente'} ${customerData.customer.last_name || ''} - ${customerData.customer.phone}`
            : 'Nenhum cliente carregado.'}
        </p>
      </div>

      <div className="panel p-4 space-y-3">
        <h2 className="font-semibold">Movimentar pontos</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input value={points} onChange={(event) => setPoints(event.target.value)} className="border border-brand-100 rounded-lg px-3 py-2" placeholder="Pontos" />
          <input value={reason} onChange={(event) => setReason(event.target.value)} className="border border-brand-100 rounded-lg px-3 py-2" placeholder="Motivo" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void handleMove('earn')} disabled={loadingMove} className="px-3 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-60">
            Adicionar pontos
          </button>
          <button onClick={() => void handleMove('redeem')} disabled={loadingMove} className="px-3 py-2 rounded-lg bg-amber-500 text-white disabled:opacity-60">
            Resgatar pontos
          </button>
        </div>
      </div>

      <div className="panel p-4">
        <h2 className="font-semibold">Extrato</h2>
        <div className="mt-2 space-y-2 text-sm">
          {moves.map((move) => (
            <div key={move.id} className="rounded-lg border border-brand-100 px-3 py-2 flex items-center justify-between">
              <span>
                {move.type} - {move.reason}
              </span>
              <span className={move.points >= 0 ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                {move.points > 0 ? '+' : ''}
                {move.points}
              </span>
            </div>
          ))}
          {moves.length === 0 ? <p className="text-slate-500">Sem movimentacoes para este cliente.</p> : null}
        </div>
      </div>

      {feedback ? <p className="text-sm text-brand-700">{feedback}</p> : null}
    </div>
  )
}

export default Fidelidade
