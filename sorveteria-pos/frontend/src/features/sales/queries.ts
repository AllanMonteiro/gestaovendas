import { api } from '../../core/api'
import type { CashDashboardResponse } from './types'

type CashDashboardParams = {
  from: string
  to: string
  ordersLimit: number
  movesLimit: number
  historyLimit: number
}

export const listCashDashboard = async (params: CashDashboardParams) => {
  const response = await api.get<CashDashboardResponse>(
    `/api/cash/dashboard?from=${params.from}&to=${params.to}&orders_limit=${params.ordersLimit}&moves_limit=${params.movesLimit}&history_limit=${params.historyLimit}`
  )
  return response.data
}
