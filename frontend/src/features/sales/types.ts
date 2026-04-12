export type CashOrder = {
  id: string
  display_number?: string
  status: string
  type?: string
  customer_name?: string | null
  source?: string | null
  total: string
  created_at: string
  closed_at?: string | null
}

export type CashStatusResponse = {
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

export type CashSessionOpenResponse = {
  id: number
  opened_at: string
  initial_float: string
}

export type PaymentAgg = {
  method?: 'CASH' | 'PIX' | 'CARD' | 'CARD_CREDIT' | 'CARD_DEBIT'
  payment_method?: 'CASH' | 'PIX' | 'CARD' | 'CARD_CREDIT' | 'CARD_DEBIT'
  total: string
}

export type Reconciliation = {
  expected: { cash: string; pix: string; card: string }
  breakdown?: {
    initial_float: string
    cash_sales: string
    reforco: string
    sangria: string
  }
  counted: { cash: string; pix: string; card: string }
  divergence: { cash: string; pix: string; card: string }
}

export type CashMove = {
  id: number
  type: 'SANGRIA' | 'REFORCO'
  amount: string
  reason: string
  created_at: string
}

export type CashHistoryEntry = {
  id: number
  opened_at: string
  closed_at: string
  status: string
  initial_float: string
  reconciliation_data?: Reconciliation
}

export type Summary = {
  total_sales: string | null
  total_orders: number | null
  avg_ticket: string | null
  total_discount: string | null
  canceled_count: number | null
  canceled_total: string | null
}

export type StoreConfigResponse = {
  store_name?: string
  company_name?: string | null
  cnpj?: string | null
  address?: string | null
  printer?: {
    agent_url?: string
  }
}

export type CashDashboardResponse = {
  cash_status: CashStatusResponse
  closed_orders: CashOrder[]
  open_orders: CashOrder[]
  cash_moves: CashMove[]
  cash_history: CashHistoryEntry[]
  payments: PaymentAgg[]
  today_summary: Summary
  open_orders_count: number
  config: StoreConfigResponse
}

export type CashMoveInput = {
  type: 'SANGRIA' | 'REFORCO'
  amount: string
  reason: string
}

export type CashCloseInput = {
  counted_cash: string
  counted_pix: string
  counted_card: string
}
