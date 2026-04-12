import { useQuery } from '@tanstack/react-query'
import { ordersQueryKeys } from '../queryKeys'
import { listDeliveryOrders } from '../queries'

type UseDeliveryOrdersOptions = {
  enabled?: boolean
}

export const useDeliveryOrders = (options?: UseDeliveryOrdersOptions) =>
  useQuery({
    queryKey: ordersQueryKeys.delivery.list(),
    queryFn: listDeliveryOrders,
    enabled: options?.enabled,
  })
