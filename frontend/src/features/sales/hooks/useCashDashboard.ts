import { useQuery } from '@tanstack/react-query'
import { salesQueryKeys } from '../queryKeys'
import { listCashDashboard } from '../queries'

type UseCashDashboardParams = {
  from: string
  to: string
  ordersLimit: number
  movesLimit: number
  historyLimit: number
}

export const useCashDashboard = (params: UseCashDashboardParams) =>
  useQuery({
    queryKey: salesQueryKeys.cashDashboard.detail(params),
    queryFn: () => listCashDashboard(params),
  })
