import { useQuery } from '@tanstack/react-query'
import { ordersQueryKeys } from '../queryKeys'
import { listKitchenQueue } from '../queries'

type UseKitchenQueueOptions = {
  enabled?: boolean
}

export const useKitchenQueue = (options?: UseKitchenQueueOptions) =>
  useQuery({
    queryKey: ordersQueryKeys.kitchen.queue(),
    queryFn: listKitchenQueue,
    enabled: options?.enabled,
  })
