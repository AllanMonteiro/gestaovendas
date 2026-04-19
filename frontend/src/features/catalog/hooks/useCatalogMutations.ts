import { useMutation, useQueryClient } from '@tanstack/react-query'
import { catalogQueryKeys } from '../queryKeys'
import {
  createCategory,
  createProduct,
  createProductStockEntry,
  deleteProductStockEntry,
  deleteCategory,
  toggleProductActive,
  updateProduct,
  updateProductPrice,
  updateProductStockEntry,
} from '../mutations'
import { sortCategories } from '../queries'
import type { Category, Product, ProductPrice, ProductStockEntry } from '../types'

const sortProducts = (items: Product[]) =>
  [...items].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))

const upsertPrice = (prices: ProductPrice[], nextPrice: ProductPrice) => {
  const nextPrices = prices.filter((price) => Number(price.product) !== Number(nextPrice.product))
  nextPrices.push(nextPrice)
  return nextPrices
}

const syncProductPriceQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (current: ProductPrice[]) => ProductPrice[]
) => {
  queryClient.getQueriesData<ProductPrice[]>({ queryKey: catalogQueryKeys.productPrices.all }).forEach(([queryKey, current]) => {
    queryClient.setQueryData<ProductPrice[]>(queryKey, updater(current ?? []))
  })
}

export const useCreateCategoryMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createCategory,
    onSuccess: (category) => {
      queryClient.setQueryData<Category[]>(catalogQueryKeys.categories.list(), (current) =>
        sortCategories([...(current ?? []), category])
      )
    },
  })
}

export const useDeleteCategoryMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: (categoryId) => {
      queryClient.setQueryData<Category[]>(catalogQueryKeys.categories.list(), (current) =>
        (current ?? []).filter((category) => category.id !== categoryId)
      )
    },
  })
}

export const useCreateProductMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createProduct,
    onSuccess: ({ product, price }) => {
      const currentProducts = queryClient.getQueryData<Product[]>(catalogQueryKeys.products.list()) ?? []
      const nextProducts = sortProducts([...currentProducts, product])

      queryClient.setQueryData<Product[]>(catalogQueryKeys.products.list(), nextProducts)

      const currentPrices =
        queryClient.getQueryData<ProductPrice[]>(
          catalogQueryKeys.productPrices.list(currentProducts.map((item) => item.id))
        ) ?? []

      queryClient.setQueryData<ProductPrice[]>(
        catalogQueryKeys.productPrices.list(nextProducts.map((item) => item.id)),
        upsertPrice(currentPrices, price)
      )
    },
  })
}

export const useUpdateProductMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateProduct,
    onSuccess: ({ product, price }) => {
      queryClient.setQueryData<Product[]>(catalogQueryKeys.products.list(), (current) =>
        sortProducts((current ?? []).map((item) => (item.id === product.id ? product : item)))
      )

      syncProductPriceQueries(queryClient, (current) => upsertPrice(current, price))
    },
  })
}

export const useToggleProductActiveMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: toggleProductActive,
    onSuccess: (product) => {
      queryClient.setQueryData<Product[]>(catalogQueryKeys.products.list(), (current) =>
        sortProducts((current ?? []).map((item) => (item.id === product.id ? product : item)))
      )
    },
  })
}

export const useUpdateProductPriceMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateProductPrice,
    onSuccess: (price) => {
      syncProductPriceQueries(queryClient, (current) => upsertPrice(current, price))
    },
  })
}

export const useCreateProductStockEntryMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createProductStockEntry,
    onSuccess: (entry) => {
      queryClient.setQueryData<Product[]>(catalogQueryKeys.products.list(), (current) =>
        sortProducts(
          (current ?? []).map((item) =>
            item.id === entry.product ? { ...item, stock: entry.current_stock ?? item.stock } : item
          )
        )
      )

      queryClient.setQueryData<ProductStockEntry[]>(catalogQueryKeys.stockEntries.list(entry.product), (current) => [
        entry,
        ...(current ?? []),
      ])
    },
  })
}

export const useUpdateProductStockEntryMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateProductStockEntry,
    onSuccess: (entry) => {
      queryClient.setQueryData<Product[]>(catalogQueryKeys.products.list(), (current) =>
        sortProducts(
          (current ?? []).map((item) =>
            item.id === entry.product ? { ...item, stock: entry.current_stock ?? item.stock } : item
          )
        )
      )

      queryClient.setQueryData<ProductStockEntry[]>(catalogQueryKeys.stockEntries.list(entry.product), (current) =>
        [entry, ...(current ?? []).filter((item) => item.id !== entry.id)]
          .sort((left, right) => {
            if (left.arrival_date !== right.arrival_date) {
              return left.arrival_date < right.arrival_date ? 1 : -1
            }
            return left.created_at < right.created_at ? 1 : -1
          })
      )
    },
  })
}

export const useDeleteProductStockEntryMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ productId, entryId }: { productId: number; entryId: number }) => deleteProductStockEntry(productId, entryId),
    onSuccess: (result) => {
      queryClient.setQueryData<Product[]>(catalogQueryKeys.products.list(), (current) =>
        sortProducts(
          (current ?? []).map((item) =>
            item.id === result.product ? { ...item, stock: result.current_stock ?? item.stock } : item
          )
        )
      )

      queryClient.setQueryData<ProductStockEntry[]>(catalogQueryKeys.stockEntries.list(result.product), (current) =>
        (current ?? []).filter((item) => item.id !== result.id)
      )
    },
  })
}
