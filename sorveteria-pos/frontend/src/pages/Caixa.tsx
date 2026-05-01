import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../core/api'
import { openThermalReceiptPdf, type ThermalReceiptPayload } from '../app/thermalReceipt'
import { useSocket } from '../hooks/useSocket'
import { useCashDashboard } from '../features/sales/hooks/useCashDashboard'
import { ChartCard, ChartEmptyState, ChartLegend, ChartPill } from '../components/ChartCard'
import {
  useCloseCashSessionMutation,
  useCreateCashMoveMutation,
  useDeleteCashMoveMutation,
  useOpenCashSessionMutation,
} from '../features/sales/hooks/useCashMutations'
import { salesQueryKeys } from '../features/sales/queryKeys'
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  FilterBar,
  Input,
  Modal,
  PageHeader,
  SectionHeader,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableElement,
  TableHead,
  TableHeaderCell,
  TableRow,
  TextArea,
} from '../components/ui'

type Order = {
  id: string
  display_number?: string
  payment_label?: string | null
  status: string
  type?: string
  customer_name?: string | null
  source?: string | null
  total: string
  created_at: string
  closed_at?: string | null
}

type CashStatusResponse = {
  open: boolean
  session?: {
    id: number
    opened_at: string
    initial_float: string
  }
  totals?: {
    cash_sales: string
    reforco: string
    sangria: string
    current_cash_estimated: string
  }
}

type CashSessionOpenResponse = {
  id: number
  opened_at: string
  initial_float: string
}

type PaymentAgg = {
  method?: 'CASH' | 'PIX' | 'CARD' | 'CARD_CREDIT' | 'CARD_DEBIT'
  payment_method?: 'CASH' | 'PIX' | 'CARD' | 'CARD_CREDIT' | 'CARD_DEBIT'
  total: string
}

type Reconciliation = {
  expected: {
    cash: string
    pix: string
    card: string
    card_credit?: string | null
    card_debit?: string | null
  }
  breakdown?: {
    initial_float: string
    cash_sales: string
    reforco: string
    sangria: string
  }
  counted: {
    cash: string
    pix: string
    card: string
    card_credit?: string | null
    card_debit?: string | null
  }
  divergence: {
    cash: string
    pix: string
    card: string
    card_credit?: string | null
    card_debit?: string | null
  }
}

type CashMove = {
  id: number
  session?: number | null
  type: 'SANGRIA' | 'REFORCO'
  amount: string
  reason: string
  created_at: string
}

type CashHistoryEntry = {
  id: number
  opened_at: string
  closed_at: string
  status: string
  initial_float: string
  reconciliation_data?: Reconciliation
}

type SessionCashReason = {
  amount: number
  reason: string
  createdAt: string
}

type FlowEntry = {
  id: string
  at: string
  kind: 'VENDA_FINALIZADA' | 'REFORCO' | 'SANGRIA'
  description: string
  input: number
  output: number
  paymentLabel?: string
  moveId?: number
  canDelete?: boolean
}

type Summary = {
  total_sales: string | null
  total_orders: number | null
  avg_ticket: string | null
  total_discount: string | null
  canceled_count: number | null
  canceled_total: string | null
}

type StoreConfigResponse = {
  store_name?: string
  company_name?: string | null
  cnpj?: string | null
  address?: string | null
  printer?: {
    agent_url?: string
    printer_name?: string
  }
}

type CashDashboardResponse = {
  cash_status: CashStatusResponse
  closed_orders: Order[]
  open_orders: Order[]
  cash_moves: CashMove[]
  cash_history: CashHistoryEntry[]
  payments: PaymentAgg[]
  today_summary: Summary
  open_orders_count: number
  config: StoreConfigResponse
}

const CASH_DASHBOARD_ORDERS_LIMIT = 50
const CASH_DASHBOARD_MOVES_LIMIT = 120
const CASH_DASHBOARD_HISTORY_LIMIT = 30
const CASH_REFRESH_DEBOUNCE_MS = 350

const formatBRL = (value: string | number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const getOrderDisplayNumber = (order: Pick<Order, 'id' | 'display_number'>) => order.display_number || order.id.slice(0, 8)
const getOpenOrderLabel = (order: Order) => {
  if (order.type === 'DELIVERY') {
    return `Delivery ${(order.source || 'app').toUpperCase()}`
  }
  if (order.type === 'TABLE') {
    return 'Mesa'
  }
  return 'PDV'
}
const formatSignedBRL = (value: string | number) => {
  const numeric = Number(value || 0)
  const prefix = numeric > 0 ? '+' : numeric < 0 ? '-' : ''
  return `${prefix}${formatBRL(Math.abs(numeric))}`
}
const parseNullableAmount = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? null : Number(value)
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

const todayISO = () => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const sortClosedOrders = (orders: Order[]) =>
  [...orders].sort((a, b) => ((a.closed_at || a.created_at) < (b.closed_at || b.created_at) ? 1 : -1))

const buildDashboardSnapshot = (payload: CashDashboardResponse) =>
  JSON.stringify({
    cash_status: payload.cash_status,
    closed_orders: sortClosedOrders(payload.closed_orders),
    open_orders: payload.open_orders ?? [],
    cash_moves: payload.cash_moves,
    cash_history: payload.cash_history,
    payments: payload.payments,
    today_summary: payload.today_summary,
    open_orders_count: payload.open_orders_count,
    config: payload.config,
  })

const Caixa: React.FC = () => {
  const queryClient = useQueryClient()
  const openCashMutation = useOpenCashSessionMutation()
  const createCashMoveMutation = useCreateCashMoveMutation()
  const deleteCashMoveMutation = useDeleteCashMoveMutation()
  const closeCashMutation = useCloseCashSessionMutation()
  const [cashStatus, setCashStatus] = useState<CashStatusResponse>({ open: false })
  const [orders, setOrders] = useState<Order[]>([])
  const [openOrders, setOpenOrders] = useState<Order[]>([])
  const [cashMoves, setCashMoves] = useState<CashMove[]>([])
  const [cashHistory, setCashHistory] = useState<CashHistoryEntry[]>([])
  const [paymentsAgg, setPaymentsAgg] = useState<PaymentAgg[]>([])
  const [fromDate, setFromDate] = useState(todayISO())
  const [toDate, setToDate] = useState(todayISO())
  const [appliedFromDate, setAppliedFromDate] = useState(todayISO())
  const [appliedToDate, setAppliedToDate] = useState(todayISO())
  const [feedback, setFeedback] = useState<string>('')
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null)
  const [dailySummary, setDailySummary] = useState<Summary | null>(null)
  const [openOrdersCount, setOpenOrdersCount] = useState(0)
  const [showCashMoveModal, setShowCashMoveModal] = useState(false)
  const [cashMoveType, setCashMoveType] = useState<'SANGRIA' | 'REFORCO'>('REFORCO')
  const [cashMoveAmount, setCashMoveAmount] = useState('')
  const [cashMoveReason, setCashMoveReason] = useState('')
  const [showEditSessionModal, setShowEditSessionModal] = useState(false)
  const [editingSession, setEditingSession] = useState<any>(null)
  const [editOpenedAt, setEditOpenedAt] = useState('')
  const [editClosedAt, setEditClosedAt] = useState('')
  const [editInitialFloat, setEditInitialFloat] = useState('')

  const [showEditOrderModal, setShowEditOrderModal] = useState(false)
  const [editingOrder, setEditingOrder] = useState<any>(null)
  const [editOrderTotal, setEditOrderTotal] = useState('')
  const [editOrderPaymentMethod, setEditOrderPaymentMethod] = useState('')
  const [editOrderClosedAt, setEditOrderClosedAt] = useState('')
  const [editOrderPassword, setEditOrderPassword] = useState('')
  const [historyReasonSession, setHistoryReasonSession] = useState<{
    openedAt: string
    total: number
    reasons: SessionCashReason[]
  } | null>(null)
  const [agentUrl, setAgentUrl] = useState('')
  const [printerName, setPrinterName] = useState('auto')
  const [storeLabel, setStoreLabel] = useState('Sorveteria POS')
  const [storeCnpj, setStoreCnpj] = useState('')
  const [storeAddress, setStoreAddress] = useState('')
  const wsRefreshTimerRef = useRef<number | null>(null)
  const loadDataRequestIdRef = useRef(0)
  const dashboardSnapshotRef = useRef('')
  const dashboardQuery = useCashDashboard({
    from: appliedFromDate,
    to: appliedToDate,
    ordersLimit: CASH_DASHBOARD_ORDERS_LIMIT,
    movesLimit: CASH_DASHBOARD_MOVES_LIMIT,
    historyLimit: CASH_DASHBOARD_HISTORY_LIMIT,
  })

  const refreshDashboard = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: salesQueryKeys.cashDashboard.all })
  }, [queryClient])

  const loadData = useCallback(async () => {
    const requestId = ++loadDataRequestIdRef.current
    const result = await dashboardQuery.refetch()
    if (requestId !== loadDataRequestIdRef.current) {
      return
    }
    if (result.error) {
      setFeedback('Alguns dados do caixa falharam ao atualizar. Tente novamente.')
    }
  }, [dashboardQuery])

  const postToAgent = useCallback(async (payload: ThermalReceiptPayload) => {
    const normalizedAgentUrl = agentUrl.trim().replace(/\/$/, '')
    if (!normalizedAgentUrl) {
      return false
    }
    const response = await fetch(`${normalizedAgentUrl}/print/receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, printer_name: printerName })
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.warn('Cash print failed', {
        status: response.status,
        detail,
        printer_name: printerName,
      })
    }
    return response.ok
  }, [agentUrl, printerName])

  const buildCashSlipPayload = useCallback((title: string, details: Array<{ label: string; value: string }>): ThermalReceiptPayload => ({
    company_name: storeLabel,
    address: storeAddress || undefined,
    cnpj: storeCnpj || undefined,
    title,
    cashier: 'CAIXA',
    details,
    items: [],
    subtotal: 0,
    discount: 0,
    total: 0,
    payments: []
  }), [storeAddress, storeCnpj, storeLabel])

  useEffect(() => {
    if (!dashboardQuery.data) {
      return
    }

    const payload = dashboardQuery.data
    const sortedOrders = sortClosedOrders(payload.closed_orders)
    const snapshot = buildDashboardSnapshot({ ...payload, closed_orders: sortedOrders })
    if (snapshot === dashboardSnapshotRef.current) {
      return
    }

    dashboardSnapshotRef.current = snapshot
    startTransition(() => {
      setCashStatus(payload.cash_status)
      setOrders(sortedOrders)
      setOpenOrders(payload.open_orders ?? [])
      setCashMoves(payload.cash_moves)
      setCashHistory(payload.cash_history)
      setPaymentsAgg(payload.payments)
      setDailySummary(payload.today_summary)
      setOpenOrdersCount(payload.open_orders_count)
      setAgentUrl(payload.config.printer?.agent_url?.trim() ?? '')
      setPrinterName(payload.config.printer?.printer_name || 'auto')
      setStoreLabel(payload.config.company_name || payload.config.store_name || 'Sorveteria POS')
      setStoreCnpj(payload.config.cnpj || '')
      setStoreAddress(payload.config.address || '')
    })
    setFeedback((current) => (current === 'Alguns dados do caixa falharam ao atualizar. Tente novamente.' ? '' : current))
  }, [dashboardQuery.data])

  const applyDateFilter = () => {
    setAppliedFromDate(fromDate)
    setAppliedToDate(toDate)
  }

  const handleCashRealtimeMessage = useCallback((data: unknown) => {
    if (document.visibilityState !== 'visible') {
      return
    }
    if (
      typeof data !== 'object' ||
      data === null ||
      !('event' in data)
    ) {
      return
    }

    const eventName = String((data as { event?: unknown }).event ?? '')
    if (
      eventName === 'order_paid' ||
      eventName === 'order_canceled' ||
      eventName === 'cash_move_created' ||
      eventName === 'cash_move_deleted' ||
      eventName === 'cash_status_changed'
    ) {
      if (wsRefreshTimerRef.current !== null) {
        window.clearTimeout(wsRefreshTimerRef.current)
      }
      wsRefreshTimerRef.current = window.setTimeout(() => {
        refreshDashboard()
      }, CASH_REFRESH_DEBOUNCE_MS)
    }
  }, [refreshDashboard])

  useSocket('/ws/pdv', {
    onMessage: handleCashRealtimeMessage,
  })

  useEffect(() => {
    return () => {
      if (wsRefreshTimerRef.current !== null) {
        window.clearTimeout(wsRefreshTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        refreshDashboard()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refreshDashboard])

  const totalsByMethod = useMemo(() => {
    const initial = { CASH: 0, PIX: 0, CARD: 0, CARD_CREDIT: 0, CARD_DEBIT: 0 }
    for (const row of paymentsAgg) {
      const method = row.payment_method ?? row.method
      if (!method) {
        continue
      }
      initial[method] = Number(row.total || 0)
    }
    return initial
  }, [paymentsAgg])

  const paymentMixItems = useMemo(() => {
    const rows = [
      { label: 'Dinheiro', value: totalsByMethod.CASH, color: '#e55c2f' },
      { label: 'PIX', value: totalsByMethod.PIX, color: '#f08b55' },
      { label: 'Cartao credito', value: totalsByMethod.CARD_CREDIT, color: '#f6b287' },
      { label: 'Cartao debito', value: totalsByMethod.CARD_DEBIT, color: '#facfb5' },
      { label: 'Cartao', value: totalsByMethod.CARD, color: '#f3c39d' },
    ].filter((row) => row.value > 0)

    const total = rows.reduce((sum, row) => sum + row.value, 0)

    return {
      total,
      top: rows[0] ?? null,
      items: rows.map((row) => ({
        ...row,
        percentage: total > 0 ? Math.round((row.value / total) * 100) : 0,
      })),
    }
  }, [totalsByMethod])

  const flowEntries = useMemo<FlowEntry[]>(() => {
    const salesEntries: FlowEntry[] = orders.map((order) => ({
      id: `sale-${order.id}`,
      at: order.closed_at || order.created_at,
      kind: 'VENDA_FINALIZADA',
      description: `Comanda #${getOrderDisplayNumber(order)} finalizada`,
      input: Number(order.total || 0),
      output: 0,
      paymentLabel: order.payment_label || 'Nao informado',
      canEdit: true,
      originalId: order.id,
    }))
    const moveEntries: FlowEntry[] = cashMoves.map((move) => ({
      id: `move-${move.id}`,
      at: move.created_at,
      kind: move.type,
      description:
        move.type === 'REFORCO'
          ? `Reforco: ${move.reason || 'sem motivo'}`
          : `Sangria: ${move.reason || 'sem motivo'}`,
      input: move.type === 'REFORCO' ? Number(move.amount || 0) : 0,
      output: move.type === 'SANGRIA' ? Number(move.amount || 0) : 0,
      paymentLabel: move.type === 'REFORCO' ? 'Aporte manual' : '-',
      moveId: move.id,
      canDelete: Boolean(cashStatus.open && move.session && move.session === cashStatus.session?.id),
    }))

    return [...salesEntries, ...moveEntries].sort((a, b) => (a.at < b.at ? 1 : -1))
  }, [orders, cashMoves, cashStatus.open, cashStatus.session?.id])

  const cashHistorySangriaBySession = useMemo(() => {
    const grouped: Record<number, SessionCashReason[]> = {}

    cashMoves.forEach((move) => {
      if (move.type !== 'SANGRIA' || !move.session) {
        return
      }

      grouped[move.session] = grouped[move.session] || []
      grouped[move.session].push({
        amount: Number(move.amount || 0),
        reason: move.reason || 'Sem motivo informado',
        createdAt: move.created_at,
      })
    })

    return grouped
  }, [cashMoves])

  const reconciliationRows = useMemo(() => [
    {
      label: 'Dinheiro',
      expected: Number(reconciliation?.expected.cash ?? cashStatus.totals?.current_cash_estimated ?? 0),
      counted: parseNullableAmount(reconciliation?.counted.cash),
      divergence: parseNullableAmount(reconciliation?.divergence.cash),
    },
    {
      label: 'PIX',
      expected: Number(reconciliation?.expected.pix ?? totalsByMethod.PIX),
      counted: parseNullableAmount(reconciliation?.counted.pix),
      divergence: parseNullableAmount(reconciliation?.divergence.pix),
    },
    {
      label: 'Cartao credito',
      expected: Number(reconciliation?.expected.card_credit ?? totalsByMethod.CARD_CREDIT),
      counted: parseNullableAmount(reconciliation?.counted.card_credit),
      divergence: parseNullableAmount(reconciliation?.divergence.card_credit),
    },
    {
      label: 'Cartao debito',
      expected: Number(reconciliation?.expected.card_debit ?? totalsByMethod.CARD_DEBIT),
      counted: parseNullableAmount(reconciliation?.counted.card_debit),
      divergence: parseNullableAmount(reconciliation?.divergence.card_debit),
    },
    ...(totalsByMethod.CARD > 0 ||
      (
        Number(reconciliation?.expected.card ?? 0) -
        Number(reconciliation?.expected.card_credit ?? 0) -
        Number(reconciliation?.expected.card_debit ?? 0)
      ) > 0 ||
      (
        reconciliation?.counted.card !== undefined &&
        reconciliation?.counted.card_credit == null &&
        reconciliation?.counted.card_debit == null
      )
      ? [{
          label: 'Cartao sem classificacao',
          expected: Math.max(
            Number(reconciliation?.expected.card ?? totalsByMethod.CARD) -
              Number(reconciliation?.expected.card_credit ?? totalsByMethod.CARD_CREDIT) -
              Number(reconciliation?.expected.card_debit ?? totalsByMethod.CARD_DEBIT),
            0
          ),
          counted:
            reconciliation?.counted.card_credit == null &&
            reconciliation?.counted.card_debit == null
              ? parseNullableAmount(reconciliation?.counted.card)
              : null,
          divergence:
            reconciliation?.divergence.card_credit == null &&
            reconciliation?.divergence.card_debit == null
              ? parseNullableAmount(reconciliation?.divergence.card)
              : null,
        }]
      : []),
    {
      label: 'Cartao total',
      expected: Number(reconciliation?.expected.card ?? (totalsByMethod.CARD + totalsByMethod.CARD_CREDIT + totalsByMethod.CARD_DEBIT)),
      counted: parseNullableAmount(reconciliation?.counted.card),
      divergence: parseNullableAmount(reconciliation?.divergence.card),
    }
  ], [reconciliation, totalsByMethod])

  const reconciliationDisplayRows = useMemo(
    () => reconciliationRows.filter((row) => row.label !== 'Cartao total'),
    [reconciliationRows]
  )

  const expectedTotal = reconciliationDisplayRows.reduce((total, row) => total + row.expected, 0)
  const countedTotal = reconciliationDisplayRows.reduce((total, row) => total + (row.counted ?? 0), 0)
  const divergenceTotal = reconciliationDisplayRows.reduce((total, row) => total + (row.divergence ?? 0), 0)

  const handleOpenCash = async () => {
    if (cashStatus.open) {
      setFeedback('Caixa ja esta aberto.')
      return
    }
    const initialFloat = window.prompt('Fundo inicial do caixa (R$):', '0')
    if (!initialFloat) {
      return
    }
    try {
      const normalizedInitialFloat = initialFloat.replace(',', '.')
      const response = await openCashMutation.mutateAsync(normalizedInitialFloat)
      setCashStatus({
        open: true,
        session: {
          id: response.data.id,
          opened_at: response.data.opened_at,
          initial_float: response.data.initial_float,
        },
        totals: {
          cash_sales: '0',
          reforco: '0',
          sangria: '0',
          current_cash_estimated: response.data.initial_float,
        }
      })
      const slipPayload = buildCashSlipPayload('ABERTURA DE CAIXA', [
        { label: 'Fundo inicial', value: formatBRL(normalizedInitialFloat) },
        { label: 'Data', value: new Date().toLocaleString('pt-BR') }
      ])
      let printed = false
      try {
        printed = await postToAgent(slipPayload)
      } catch {
        printed = false
      }
      const pdfOpened = !printed ? openThermalReceiptPdf(slipPayload) : false
      setFeedback(
        printed
          ? 'Caixa aberto com sucesso.'
          : pdfOpened
            ? 'Caixa aberto. Cupom aberto para imprimir/salvar em PDF.'
            : 'Caixa aberto, mas a impressao do cupom falhou.'
      )
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao abrir caixa.'))
    }
  }

  const openCashMoveModal = (type: 'SANGRIA' | 'REFORCO') => {
    if (!cashStatus.open) {
      setFeedback('Abra o caixa antes de registrar movimentacoes.')
      return
    }
    setCashMoveType(type)
    setCashMoveAmount('')
    setCashMoveReason('')
    setShowCashMoveModal(true)
  }

  const openEditSessionModal = (session: any) => {
    setEditingSession(session)
    setEditOpenedAt(session.opened_at.substring(0, 16))
    setEditClosedAt(session.closed_at ? session.closed_at.substring(0, 16) : '')
    setEditInitialFloat(String(session.initial_float))
    setShowEditSessionModal(true)
  }

  const openEditOrderModal = (orderId: string) => {
    const order = orders.find(o => o.id === orderId || `sale-${o.id}` === orderId)
    if (!order) return
    setEditingOrder(order)
    setEditOrderTotal(String(order.total))
    setEditOrderPaymentMethod(order.payment_method || 'CASH')
    setEditOrderClosedAt(order.closed_at ? order.closed_at.substring(0, 16) : '')
    setEditOrderPassword('')
    setShowEditOrderModal(true)
  }

  const handleUpdateOrder = async () => {
    if (!editingOrder) return
    try {
      const response = await api.post(`/api/orders/${editingOrder.id}/adjust-finalized-sale`, {
        total: editOrderTotal,
        payment_method: editOrderPaymentMethod,
        closed_at: editOrderClosedAt,
        password: editOrderPassword,
      })
      if (response.status === 200) {
        setFeedback('Pedido atualizado com sucesso!')
        setShowEditOrderModal(false)
        refreshDashboard()
      }
    } catch (err: any) {
      setFeedback(err.response?.data?.detail || 'Erro ao atualizar pedido')
    }
  }

  const handleUpdateSession = async () => {
    if (!editingSession) return
    try {
      const response = await api.patch(`/api/cash/session/${editingSession.id}`, {
        opened_at: editOpenedAt,
        closed_at: editClosedAt || null,
        initial_float: editInitialFloat,
      })
      if (response.status === 200) {
        setFeedback('Sessao atualizada com sucesso!')
        setShowEditSessionModal(false)
        refreshDashboard()
      }
    } catch (err: any) {
      setFeedback(err.response?.data?.detail || 'Erro ao atualizar sessao')
    }
  }

  const handleCashMove = async () => {
    const normalizedAmount = cashMoveAmount.replace(',', '.').trim()
    const numericAmount = Number(normalizedAmount)
    if (!normalizedAmount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFeedback('Informe um valor valido para a movimentacao.')
      return
    }
    if (!cashMoveReason.trim()) {
      setFeedback('Informe o motivo da movimentacao.')
      return
    }
    try {
      await createCashMoveMutation.mutateAsync({
        type: cashMoveType,
        amount: normalizedAmount,
        reason: cashMoveReason.trim()
      })
      setShowCashMoveModal(false)
      setCashMoveAmount('')
      setCashMoveReason('')
      setFeedback(cashMoveType === 'REFORCO' ? 'Reforco registrado.' : 'Sangria registrada.')
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao registrar movimentacao.'))
    }
  }

  const handleDeleteCashMove = async (entry: FlowEntry) => {
    if (!entry.moveId || !entry.canDelete) {
      return
    }
    const confirmed = window.confirm(
      `Excluir ${entry.kind === 'REFORCO' ? 'este reforco' : 'esta sangria'} do caixa?`
    )
    if (!confirmed) {
      return
    }

    try {
      await deleteCashMoveMutation.mutateAsync(entry.moveId)
      setFeedback(entry.kind === 'REFORCO' ? 'Reforco excluido.' : 'Sangria excluida.')
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao excluir movimentacao.'))
    }
  }

  const handleCloseCash = async () => {
    if (!cashStatus.open) {
      setFeedback('Nao ha caixa aberto para fechar.')
      return
    }
    const countedCash = window.prompt('Contagem dinheiro (R$):', String(totalsByMethod.CASH))
    if (!countedCash) {
      return
    }
    const countedPix = window.prompt('Contagem PIX (R$):', String(totalsByMethod.PIX))
    if (!countedPix) {
      return
    }
    const countedCardCredit = window.prompt('Contagem cartao credito (R$):', String(totalsByMethod.CARD_CREDIT))
    if (!countedCardCredit) {
      return
    }
    const countedCardDebit = window.prompt('Contagem cartao debito (R$):', String(totalsByMethod.CARD_DEBIT))
    if (!countedCardDebit) {
      return
    }
    const countedCardOther = totalsByMethod.CARD > 0
      ? window.prompt('Contagem cartao sem classificacao (R$):', String(totalsByMethod.CARD))
      : null
    if (totalsByMethod.CARD > 0 && !countedCardOther) {
      return
    }
    const countedCardCombined = (
      Number(countedCardCredit.replace(',', '.')) +
      Number(countedCardDebit.replace(',', '.')) +
      Number((countedCardOther || '0').replace(',', '.'))
    ).toFixed(2)

    try {
      const response = await closeCashMutation.mutateAsync({
        counted_cash: countedCash.replace(',', '.'),
        counted_pix: countedPix.replace(',', '.'),
        counted_card_credit: countedCardCredit.replace(',', '.'),
        counted_card_debit: countedCardDebit.replace(',', '.'),
        counted_card: countedCardCombined
      })
      setReconciliation(response.data)
      const slipPayload = buildCashSlipPayload('FECHAMENTO DE CAIXA', [
        { label: 'Fundo inicial', value: formatBRL(response.data.breakdown?.initial_float ?? cashStatus.session?.initial_float ?? 0) },
        { label: 'Entradas em dinheiro', value: formatBRL(response.data.breakdown?.cash_sales ?? 0) },
        { label: 'Reforcos', value: formatBRL(response.data.breakdown?.reforco ?? 0) },
        { label: 'Sangrias', value: formatBRL(response.data.breakdown?.sangria ?? 0) },
        { label: 'Dinheiro esperado', value: formatBRL(response.data.expected.cash) },
        { label: 'PIX esperado', value: formatBRL(response.data.expected.pix) },
        { label: 'Credito esperado', value: formatBRL(response.data.expected.card_credit ?? 0) },
        { label: 'Debito esperado', value: formatBRL(response.data.expected.card_debit ?? 0) },
        { label: 'Cartao total esperado', value: formatBRL(response.data.expected.card) },
        { label: 'Dinheiro contado', value: formatBRL(response.data.counted.cash) },
        { label: 'PIX contado', value: formatBRL(response.data.counted.pix) },
        { label: 'Credito contado', value: formatBRL(response.data.counted.card_credit ?? 0) },
        { label: 'Debito contado', value: formatBRL(response.data.counted.card_debit ?? 0) },
        { label: 'Cartao total contado', value: formatBRL(response.data.counted.card) },
        { label: 'Divergencia dinheiro', value: formatSignedBRL(response.data.divergence.cash) },
        { label: 'Divergencia PIX', value: formatSignedBRL(response.data.divergence.pix) },
        { label: 'Divergencia credito', value: formatSignedBRL(response.data.divergence.card_credit ?? 0) },
        { label: 'Divergencia debito', value: formatSignedBRL(response.data.divergence.card_debit ?? 0) },
        { label: 'Divergencia cartao total', value: formatSignedBRL(response.data.divergence.card) }
      ])
      let printed = false
      try {
        printed = await postToAgent(slipPayload)
      } catch {
        printed = false
      }
      const pdfOpened = !printed ? openThermalReceiptPdf(slipPayload) : false
      setFeedback(
        printed
          ? 'Caixa fechado e conciliado.'
          : pdfOpened
            ? 'Caixa fechado. Cupom aberto para imprimir/salvar em PDF.'
            : 'Caixa fechado, mas a impressao do cupom falhou.'
      )
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao fechar caixa.'))
    }
  }

  return (
    <div className="ui-screen">
      <PageHeader
        eyebrow="Financeiro"
        title="Caixa"
        description="Resumo operacional do caixa com foco em leitura rapida, conciliacao e movimentos do dia."
        meta={
          <div className="flex flex-wrap gap-2">
            <Badge variant={cashStatus.open ? 'success' : 'warning'}>
              {cashStatus.open ? 'Sessao aberta' : 'Sessao fechada'}
            </Badge>
            <Badge variant="brand">{openOrdersCount} pedido(s) em aberto</Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Caixa atual" value={formatBRL(cashStatus.totals?.current_cash_estimated ?? 0)} description={cashStatus.open ? 'Sessao aberta' : 'Sessao fechada'} tone="accent" />
        <StatCard label="Abertura do caixa" value={formatBRL(cashStatus.session?.initial_float ?? 0)} description={cashStatus.open ? 'Fundo inicial da sessao aberta' : 'Sem sessao aberta'} />
        <StatCard label="Entrada PIX" value={formatBRL(totalsByMethod.PIX)} />
        <StatCard label="Cartao credito" value={formatBRL(totalsByMethod.CARD_CREDIT)} />
        <StatCard label="Cartao debito" value={formatBRL(totalsByMethod.CARD_DEBIT)} />
        <StatCard label="Entrada dinheiro" value={formatBRL(totalsByMethod.CASH)} />
        <StatCard label="Total reforco" value={formatBRL(cashStatus.totals?.reforco ?? 0)} />
        <StatCard label="Total sangria" value={formatBRL(cashStatus.totals?.sangria ?? 0)} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section className="ui-spotlight-card">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <p className="ui-spotlight-eyebrow">Sessao em foco</p>
              <h2 className="ui-spotlight-title">
                {cashStatus.open ? 'Caixa aberto e operando' : 'Caixa aguardando abertura'}
              </h2>
              <p className="ui-spotlight-copy">
                {cashStatus.open
                  ? 'Acompanhe saldo estimado, pedidos pendentes e o risco de divergencia antes do fechamento.'
                  : 'Abra o caixa para liberar vendas, registrar movimentos e iniciar a conciliacao do dia.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={cashStatus.open ? 'success' : 'warning'}>
                {cashStatus.open ? 'Operacao ativa' : 'Sessao fechada'}
              </Badge>
              <Badge variant={openOrdersCount > 0 ? 'warning' : 'neutral'}>
                {openOrdersCount > 0 ? `${openOrdersCount} pedido(s) pendente(s)` : 'Sem bloqueios'}
              </Badge>
              <Badge variant={divergenceTotal === 0 ? 'success' : 'warning'}>
                {divergenceTotal === 0 ? 'Fechamento alinhado' : 'Divergencia em atencao'}
              </Badge>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="ui-inline-card">
              <p className="ui-micro-label">Saldo atual em dinheiro</p>
              <p className="ui-spotlight-value">{formatBRL(cashStatus.totals?.current_cash_estimated ?? 0)}</p>
              <p className="ui-micro-copy">
                Fundo: {formatBRL(cashStatus.session?.initial_float ?? 0)} | Vendas em dinheiro: {formatBRL(cashStatus.totals?.cash_sales ?? 0)}
              </p>
            </div>
            <div className="ui-micro-grid">
              <div className="ui-micro-card">
                <p className="ui-micro-label">PIX no periodo</p>
                <p className="ui-micro-value">{formatBRL(totalsByMethod.PIX)}</p>
                <p className="ui-micro-copy">Leitura rapida da participacao digital nas entradas do dia.</p>
              </div>
              <div className="ui-micro-card">
                <p className="ui-micro-label">Cartoes</p>
                <p className="ui-micro-value">{formatBRL(totalsByMethod.CARD_CREDIT + totalsByMethod.CARD_DEBIT + totalsByMethod.CARD)}</p>
                <p className="ui-micro-copy">Credito, debito e cartao sem classificacao consolidados.</p>
              </div>
              <div className="ui-micro-card">
                <p className="ui-micro-label">Reforcos</p>
                <p className="ui-micro-value">{formatBRL(cashStatus.totals?.reforco ?? 0)}</p>
                <p className="ui-micro-copy">Aportes manuais registrados para sustentar a operacao.</p>
              </div>
              <div className="ui-micro-card">
                <p className="ui-micro-label">Sangrias</p>
                <p className="ui-micro-value">{formatBRL(cashStatus.totals?.sangria ?? 0)}</p>
                <p className="ui-micro-copy">Retiradas efetuadas e refletidas no saldo estimado.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="ui-spotlight-card ui-spotlight-card-muted">
          <p className="ui-spotlight-eyebrow">Fechamento do dia</p>
          <h2 className="ui-spotlight-title">Conferencia antes de conciliar</h2>
          <p className="ui-spotlight-copy">
            Este resumo ajuda a decidir se o caixa pode ser encerrado agora ou se ainda ha pedidos e movimentos para resolver.
          </p>
          <div className="mt-5 space-y-3">
            <div className="ui-inline-card flex items-center justify-between gap-3">
              <div>
                <p className="ui-micro-label">Previsto para fechar</p>
                <p className="ui-micro-value">{formatBRL(expectedTotal)}</p>
              </div>
              <Badge variant="brand">Previsto</Badge>
            </div>
            <div className="ui-inline-card flex items-center justify-between gap-3">
              <div>
                <p className="ui-micro-label">Divergencia atual</p>
                <p className={`ui-micro-value ${divergenceTotal === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {formatSignedBRL(divergenceTotal)}
                </p>
              </div>
              <Badge variant={divergenceTotal === 0 ? 'success' : 'warning'}>
                {divergenceTotal === 0 ? 'Sem divergencia' : 'Atenção'}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                onClick={() => void loadData()}
                variant="secondary"
              >
                Atualizar fluxo
              </Button>
              <Button
                onClick={() => void handleCloseCash()}
                disabled={openOrdersCount > 0}
                variant="primary"
              >
                Fechar e conciliar
              </Button>
            </div>
          </div>
        </section>
      </div>

      <ChartCard
        title="Mix de pagamentos do dia"
        description="Distribuicao visual das entradas ja registradas no caixa para leitura rapida durante a operacao."
        meta={<ChartPill>Caixa</ChartPill>}
        actions={<ChartPill>{formatBRL(paymentMixItems.total)}</ChartPill>}
        footer={
          paymentMixItems.items.length > 0 ? (
            <ChartLegend
              items={paymentMixItems.items.map((item) => ({
                label: item.label,
                value: formatBRL(item.value),
                color: item.color,
              }))}
            />
          ) : null
        }
      >
        {paymentMixItems.items.length === 0 ? (
          <ChartEmptyState
            title="Sem pagamentos registrados"
            description="Assim que houver vendas finalizadas no filtro atual, o mix de pagamentos aparecera aqui."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,0.9fr)]">
            <div className="space-y-3">
              {paymentMixItems.items.map((item) => (
                <div key={item.label} className="ui-inline-card px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm font-medium text-slate-800">{item.label}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">{formatBRL(item.value)}</p>
                      <p className="text-xs text-slate-500">{item.percentage}% do total</p>
                    </div>
                  </div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Card className="p-4" tone="muted">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Leitura executiva</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{formatBRL(paymentMixItems.total)}</p>
              <p className="mt-2 text-sm text-slate-500">Total consolidado entre dinheiro, PIX e cartoes no periodo aplicado.</p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Metodo dominante</span>
                  <span className="font-semibold text-slate-900">{paymentMixItems.top?.label ?? 'Sem dados'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Participacao</span>
                  <span className="font-semibold text-slate-900">{paymentMixItems.top ? `${paymentMixItems.top.percentage}%` : '--'}</span>
                </div>
              </div>
            </Card>
          </div>
        )}
      </ChartCard>

      <Card className="p-4 space-y-3">
        <SectionHeader
          title="Fluxo diario do caixa"
          description="Visao resumida da abertura, das vendas do dia e da divergencia atual."
          actions={<Button variant="secondary" size="sm" onClick={() => void loadData()}>Atualizar fluxo</Button>}
        />
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
          <Card className="p-3" tone="muted">
            <p className="text-xs uppercase tracking-wide text-slate-500">1. Abertura</p>
            <p className={`mt-1 text-sm font-semibold ${cashStatus.open ? 'text-emerald-700' : 'text-amber-700'}`}>
              {cashStatus.open ? 'Caixa aberto' : 'Caixa fechado'}
            </p>
          </Card>
          <Card className="p-3" tone="muted">
            <p className="text-xs uppercase tracking-wide text-slate-500">2. Vendas de hoje</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {dailySummary?.total_orders ?? 0} pedidos | {formatBRL(dailySummary?.total_sales ?? 0)}
            </p>
            <p className="text-xs text-slate-500">
              Finalizados: {dailySummary?.total_orders ?? 0} | Cancelados: {dailySummary?.canceled_count ?? 0}
            </p>
          </Card>
          <Card className="p-3" tone={divergenceTotal === 0 ? 'success' : 'warning'}>
            <p className="text-xs uppercase tracking-wide text-slate-500">3. Fechamento</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              Divergencia atual: {formatSignedBRL(divergenceTotal)}
            </p>
          </Card>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card className="p-4 space-y-3">
          <SectionHeader
            title="Abertura e movimentacoes"
            description="Abra o caixa, registre reforcos e sangrias com os mesmos atalhos de antes."
          />
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {!cashStatus.open ? (
              <Button
                onClick={() => void handleOpenCash()}
                variant="primary"
                fullWidth
              >
                Abrir caixa
              </Button>
            ) : (
              <Button
                type="button"
                disabled
                variant="secondary"
                fullWidth
              >
                Caixa ja aberto
              </Button>
            )}
            <Button
              onClick={() => openCashMoveModal('SANGRIA')}
              disabled={!cashStatus.open}
              variant="warning"
              fullWidth
            >
              Registrar sangria
            </Button>
            <Button
              onClick={() => openCashMoveModal('REFORCO')}
              disabled={!cashStatus.open}
              variant="success"
              fullWidth
            >
              Registrar reforco
            </Button>
          </div>
        <Card className="px-3 py-2 text-sm text-slate-600" tone="muted">
          {cashStatus.open
            ? `Sessao aberta em ${new Date(cashStatus.session?.opened_at || '').toLocaleString('pt-BR')}`
            : 'Nenhuma sessao de caixa aberta.'}
        </Card>
        <Card className="px-3 py-2 text-sm text-slate-700">
          Pedidos em aberto: <span className="font-semibold">{openOrdersCount}</span>
        </Card>
        {openOrdersCount > 0 ? (
          <Card className="p-3 text-sm text-amber-800" tone="warning">
            <p className="font-semibold">Pedidos bloqueando o fechamento</p>
            <div className="mt-2 space-y-2">
              {openOrders.map((order) => (
                <div key={order.id} className="ui-inline-card px-3 py-2">
                  <div className="font-semibold">
                    #{getOrderDisplayNumber(order)} | {getOpenOrderLabel(order)} | {order.status}
                  </div>
                  <div className="text-xs text-slate-600">
                    Cliente: {order.customer_name || 'Nao informado'} | Criado em {new Date(order.created_at).toLocaleString('pt-BR')}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </Card>

        <Card className="p-4 space-y-3">
          <SectionHeader
            title="Fechamento"
            description="Conferencia do previsto, informado e divergencia antes de concluir a sessao."
            meta={<Badge variant={openOrdersCount > 0 ? 'warning' : 'success'}>{openOrdersCount > 0 ? 'Bloqueado por pedidos abertos' : 'Pronto para conciliar'}</Badge>}
          />
          <div className="grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-3">
            <div className="ui-inline-card p-3.5">
              <p className="text-xs uppercase tracking-wide text-slate-500">Previsto</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatBRL(expectedTotal)}</p>
              <p className="mt-1 text-xs text-slate-500">Total esperado para o fechamento.</p>
            </div>
            <div className="ui-inline-card p-3.5">
              <p className="text-xs uppercase tracking-wide text-slate-500">Informado</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{reconciliation ? formatBRL(countedTotal) : '--'}</p>
              <p className="mt-1 text-xs text-slate-500">Aparece apos executar a conciliacao.</p>
            </div>
            <div className={`ui-inline-card p-3.5 ${divergenceTotal === 0 ? 'border-emerald-200 bg-emerald-50/90' : 'border-rose-200 bg-rose-50/90'}`}>
              <p className="text-xs uppercase tracking-wide text-slate-500">Divergencia</p>
              <p className={`mt-2 text-2xl font-semibold ${divergenceTotal === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{reconciliation ? formatSignedBRL(divergenceTotal) : '--'}</p>
              <p className="mt-1 text-xs text-slate-500">Negativo indica falta. Positivo indica sobra.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-brand-100 overflow-hidden">
            <div className="grid min-w-[560px] grid-cols-4 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Forma</span>
              <span>Esperado</span>
              <span>Informado</span>
              <span>Divergencia</span>
            </div>
            {reconciliationDisplayRows.map((row) => (
              <div key={row.label} className="grid min-w-[560px] grid-cols-4 items-center border-t border-brand-100 px-4 py-3 text-sm">
                <span className="font-semibold text-slate-800">{row.label}</span>
                <span className="text-slate-700">{formatBRL(row.expected)}</span>
                <span className="text-slate-700">{reconciliation && row.counted !== null ? formatBRL(row.counted) : '--'}</span>
                <span className={row.divergence === null || row.divergence === 0 ? 'text-emerald-700' : 'font-semibold text-rose-700'}>
                  {reconciliation && row.divergence !== null ? formatSignedBRL(row.divergence) : '--'}
                </span>
              </div>
            ))}
          </div>
          {reconciliation ? (
            <div className="rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-700">
              Conciliacao concluida para esta sessao.
            </div>
          ) : (
            <div className="rounded-xl border border-brand-100 p-3 text-sm text-slate-500">Ainda sem conciliacao nesta sessao. O resumo acima ja mostra o previsto para conferencia.</div>
          )}
          <Button
            onClick={() => void handleCloseCash()}
            disabled={openOrdersCount > 0}
            variant="primary"
          >
            Fechar e conciliar
          </Button>
          {openOrdersCount > 0 ? (
            <p className="text-xs text-amber-700">Nao e possivel fechar o caixa com pedidos em aberto.</p>
          ) : null}
        </Card>
      </div>

      <FilterBar
        title="Fluxo de caixa"
        description="Vendas finalizadas, sangrias e reforcos dentro do periodo filtrado."
        actions={<Badge variant="neutral">{flowEntries.length} movimento(s)</Badge>}
      >
        <Input value={fromDate} onChange={(event) => setFromDate(event.target.value)} type="date" className="w-auto min-w-[150px]" label="De" />
        <Input value={toDate} onChange={(event) => setToDate(event.target.value)} type="date" className="w-auto min-w-[150px]" label="Ate" />
        <Button variant="secondary" size="sm" onClick={applyDateFilter}>Filtrar periodo</Button>
      </FilterBar>

      {feedback ? (
        <Card className="p-3" tone="accent">
          <p className="text-sm font-medium text-slate-700">{feedback}</p>
        </Card>
      ) : null}

      <Card className="p-4">
        <Table>
          <TableElement>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Data/Hora</TableHeaderCell>
                <TableHeaderCell>Operacao</TableHeaderCell>
                <TableHeaderCell>Forma de entrada</TableHeaderCell>
                <TableHeaderCell>Entrada</TableHeaderCell>
                <TableHeaderCell>Saida</TableHeaderCell>
                <TableHeaderCell>Acao</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {flowEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{new Date(entry.at).toLocaleString('pt-BR')}</TableCell>
                  <TableCell>{entry.description}</TableCell>
                  <TableCell>{entry.paymentLabel || '-'}</TableCell>
                  <TableCell className="text-emerald-700">{entry.input > 0 ? formatBRL(entry.input) : '-'}</TableCell>
                  <TableCell className="text-rose-700">{entry.output > 0 ? formatBRL(entry.output) : '-'}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {entry.canDelete && (
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={deleteCashMoveMutation.isPending}
                          onClick={() => void handleDeleteCashMove(entry)}
                        >
                          Apagar
                        </Button>
                      )}
                      {entry.canEdit && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => openEditOrderModal(entry.originalId)}
                        >
                          Editar
                        </Button>
                      )}
                      {!entry.canDelete && !entry.canEdit && (
                        <span className="text-slate-400">-</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {flowEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500">
                    Nenhum movimento de fluxo no periodo.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </TableElement>
        </Table>
      </Card>

      <Card className="p-4">
        <SectionHeader
          title="Historico de caixa fechado"
          description="Consulte aberturas, saidas, fechamento em dinheiro e divergencias das sessoes encerradas."
          meta={<Badge variant="neutral">{cashHistory.length} sessao(oes)</Badge>}
        />
        <Table>
          <TableElement>
            <TableHead>
              <TableRow>
                <TableRow>
                  <TableHeaderCell>Abertura</TableHeaderCell>
                  <TableHeaderCell>Fechamento</TableHeaderCell>
                  <TableHeaderCell>Abertura em dinheiro</TableHeaderCell>
                  <TableHeaderCell>Saida em dinheiro</TableHeaderCell>
                  <TableHeaderCell>Fechamento em dinheiro</TableHeaderCell>
                  <TableHeaderCell>Divergencia (Dinheiro / PIX / Credito / Debito)</TableHeaderCell>
                  <TableHeaderCell>Acoes</TableHeaderCell>
                </TableRow>
              </TableRow>
            </TableHead>
            <TableBody>
              {cashHistory.map((session) => {
                const sangrias = cashHistorySangriaBySession[session.id] || []
                const totalCashOut = sangrias.reduce((total, item) => total + item.amount, 0)
                const closingCash = session.reconciliation_data
                  ? Number(session.reconciliation_data.counted.cash || session.reconciliation_data.expected.cash || 0)
                  : null

                return (
                  <TableRow key={session.id}>
                    <TableCell>{new Date(session.opened_at).toLocaleString('pt-BR')}</TableCell>
                    <TableCell>{new Date(session.closed_at).toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="font-medium">{formatBRL(session.initial_float)}</TableCell>
                    <TableCell>
                      {totalCashOut > 0 ? (
                        <button
                          type="button"
                          className="font-medium text-rose-700 underline decoration-dotted underline-offset-4"
                          onClick={() =>
                            setHistoryReasonSession({
                              openedAt: session.opened_at,
                              total: totalCashOut,
                              reasons: sangrias,
                            })
                          }
                        >
                          {formatBRL(totalCashOut)}
                        </button>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {closingCash !== null ? formatBRL(closingCash) : <span className="text-slate-400">Sem dados</span>}
                    </TableCell>
                    <TableCell>
                      {session.reconciliation_data ? (
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className={Number(session.reconciliation_data.divergence.cash) === 0 ? 'text-emerald-700' : 'text-rose-700 font-medium'}>
                            Din: {formatSignedBRL(session.reconciliation_data.divergence.cash)}
                          </span>
                          <span className={Number(session.reconciliation_data.divergence.pix) === 0 ? 'text-emerald-700' : 'text-rose-700 font-medium'}>
                            PIX: {formatSignedBRL(session.reconciliation_data.divergence.pix)}
                          </span>
                          {session.reconciliation_data.divergence.card_credit != null || session.reconciliation_data.divergence.card_debit != null ? (
                            <>
                              <span className={Number(session.reconciliation_data.divergence.card_credit || 0) === 0 ? 'text-emerald-700' : 'text-rose-700 font-medium'}>
                                Cred: {formatSignedBRL(session.reconciliation_data.divergence.card_credit || 0)}
                              </span>
                              <span className={Number(session.reconciliation_data.divergence.card_debit || 0) === 0 ? 'text-emerald-700' : 'text-rose-700 font-medium'}>
                                Deb: {formatSignedBRL(session.reconciliation_data.divergence.card_debit || 0)}
                              </span>
                            </>
                          ) : (
                            <span className={Number(session.reconciliation_data.divergence.card) === 0 ? 'text-emerald-700' : 'text-rose-700 font-medium'}>
                              Car: {formatSignedBRL(session.reconciliation_data.divergence.card)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">Sem dados</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => openEditSessionModal(session)}
                      >
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {cashHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500">
                    Nenhum caixa fechado no periodo.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </TableElement>
        </Table>
      </Card>

      <Modal
        open={Boolean(historyReasonSession)}
        onClose={() => setHistoryReasonSession(null)}
        title="Motivos das saidas em dinheiro"
        description={
          historyReasonSession
            ? `Sessao aberta em ${new Date(historyReasonSession.openedAt).toLocaleString('pt-BR')}.`
            : undefined
        }
        footer={
          <Button type="button" onClick={() => setHistoryReasonSession(null)} variant="secondary">
            Fechar
          </Button>
        }
      >
        {historyReasonSession ? (
          <div className="space-y-4">
            <Card className="p-4" tone="accent">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Total de saidas</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{formatBRL(historyReasonSession.total)}</p>
            </Card>
            <div className="space-y-3">
              {historyReasonSession.reasons.map((reason, index) => (
                <Card key={`${reason.createdAt}-${index}`} className="p-4" tone="muted">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">{reason.reason || 'Sem motivo informado'}</p>
                      <p className="text-xs text-slate-500">{new Date(reason.createdAt).toLocaleString('pt-BR')}</p>
                    </div>
                    <Badge variant="warning">{formatBRL(reason.amount)}</Badge>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={showCashMoveModal}
        onClose={() => setShowCashMoveModal(false)}
        title={cashMoveType === 'REFORCO' ? 'Registrar reforco' : 'Registrar sangria'}
        description="Preencha o valor e o motivo para registrar a movimentacao no caixa."
        footer={
          <>
            <Button type="button" onClick={() => setShowCashMoveModal(false)} variant="secondary">
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleCashMove()} variant={cashMoveType === 'REFORCO' ? 'success' : 'warning'}>
              Confirmar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            value={cashMoveAmount}
            onChange={(event) => setCashMoveAmount(event.target.value)}
            placeholder="Valor em R$"
            inputMode="decimal"
            label="Valor"
          />
          <TextArea
            value={cashMoveReason}
            onChange={(event) => setCashMoveReason(event.target.value)}
            placeholder="Motivo da movimentacao"
            rows={3}
            label="Motivo"
          />
        </div>
      </Modal>

      <Modal
        open={showEditSessionModal}
        onClose={() => setShowEditSessionModal(false)}
        title="Editar sessao de caixa"
        description="Ajuste as datas e o valor de abertura da sessao. Isso afetara os calculos de divergencia."
        footer={
          <>
            <Button type="button" onClick={() => setShowEditSessionModal(false)} variant="secondary">
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleUpdateSession()} variant="brand">
              Salvar Alteracoes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            type="datetime-local"
            value={editOpenedAt}
            onChange={(e) => setEditOpenedAt(e.target.value)}
            label="Data/Hora de Abertura"
          />
          <Input
            type="datetime-local"
            value={editClosedAt}
            onChange={(e) => setEditClosedAt(e.target.value)}
            label="Data/Hora de Fechamento"
          />
          <Input
            type="number"
            step="0.01"
            value={editInitialFloat}
            onChange={(e) => setEditInitialFloat(e.target.value)}
            label="Valor Inicial (Fundo de Caixa)"
            placeholder="0.00"
          />
        </div>
      </Modal>

      <Modal
        open={showEditOrderModal}
        onClose={() => setShowEditOrderModal(false)}
        title="Editar Pedido Finalizado"
        description="Ajuste o valor, metodo de pagamento ou a data de fechamento do pedido."
        footer={
          <>
            <Button type="button" onClick={() => setShowEditOrderModal(false)} variant="secondary">
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleUpdateOrder()} variant="brand">
              Salvar Alteracoes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            type="number"
            step="0.01"
            value={editOrderTotal}
            onChange={(e) => setEditOrderTotal(e.target.value)}
            label="Total do Pedido (R$)"
          />
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 uppercase">Metodo de Pagamento</label>
            <select
              className="ui-input w-full"
              value={editOrderPaymentMethod}
              onChange={(e) => setEditOrderPaymentMethod(e.target.value)}
            >
              <option value="CASH">Dinheiro</option>
              <option value="PIX">PIX</option>
              <option value="CARD">Cartao</option>
              <option value="CARD_CREDIT">Cartao Credito</option>
              <option value="CARD_DEBIT">Cartao Debito</option>
            </select>
          </div>
          <Input
            type="datetime-local"
            value={editOrderClosedAt}
            onChange={(e) => setEditOrderClosedAt(e.target.value)}
            label="Data/Hora de Fechamento"
          />
          <Input
            type="password"
            value={editOrderPassword}
            onChange={(e) => setEditOrderPassword(e.target.value)}
            label="Senha do Administrador"
            placeholder="Obrigatorio para salvar"
          />
        </div>
      </Modal>
    </div>
  )
}

export default Caixa
