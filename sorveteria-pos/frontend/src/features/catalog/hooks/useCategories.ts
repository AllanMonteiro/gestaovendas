import { useQuery } from '@tanstack/react-query'
import { catalogQueryKeys } from '../queryKeys'
import { listCategories } from '../queries'

type UseCategoriesOptions = {
  enabled?: boolean
}

export const useCategories = (options?: UseCategoriesOptions) =>
  useQuery({
    queryKey: catalogQueryKeys.categories.list(),
    queryFn: listCategories,
    enabled: options?.enabled,
  })
