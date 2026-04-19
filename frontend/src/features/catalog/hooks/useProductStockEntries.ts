import { useQuery } from '@tanstack/react-query'
import { catalogQueryKeys } from '../queryKeys'
import { listProductStockEntries } from '../queries'

type UseProductStockEntriesOptions = {
  enabled?: boolean
}

export const useProductStockEntries = (productId: number | null, options?: UseProductStockEntriesOptions) =>
  useQuery({
    queryKey: catalogQueryKeys.stockEntries.list(productId ?? 0),
    queryFn: () => listProductStockEntries(productId ?? 0),
    enabled: (options?.enabled ?? true) && productId !== null,
  })
