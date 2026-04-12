import { useQuery } from '@tanstack/react-query'
import { catalogQueryKeys } from '../queryKeys'
import { listProducts } from '../queries'

type UseProductsOptions = {
  enabled?: boolean
}

export const useProducts = (options?: UseProductsOptions) =>
  useQuery({
    queryKey: catalogQueryKeys.products.list(),
    queryFn: listProducts,
    enabled: options?.enabled,
  })
