import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { catalogQueryKeys } from '../queryKeys'
import { listProductPrices } from '../queries'

type UseProductPricesOptions = {
  enabled?: boolean
}

export const useProductPrices = (productIds: number[], options?: UseProductPricesOptions) => {
  const normalizedProductIds = useMemo(
    () => [...new Set(productIds)].sort((left, right) => left - right),
    [productIds]
  )

  return useQuery({
    queryKey: catalogQueryKeys.productPrices.list(normalizedProductIds),
    queryFn: () => listProductPrices(normalizedProductIds),
    enabled: options?.enabled ?? true,
  })
}
