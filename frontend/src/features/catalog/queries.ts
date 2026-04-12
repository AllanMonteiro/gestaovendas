import { api } from '../../core/api'
import type { Category, Product, ProductPrice } from './types'

const sortProducts = (items: Product[]) =>
  [...items].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))

export const sortCategories = (items: Category[]) =>
  [...items].sort((left, right) => {
    const leftOrder = Number(left.sort_order ?? 0)
    const rightOrder = Number(right.sort_order ?? 0)
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }
    return left.name.localeCompare(right.name, 'pt-BR')
  })

export const listProducts = async () => {
  const response = await api.get<Product[]>('/api/products')
  return sortProducts(response.data)
}

export const listCategories = async () => {
  const response = await api.get<Category[]>('/api/categories')
  return sortCategories(response.data)
}

export const listProductPrices = async (productIds: number[]) => {
  if (productIds.length === 0) {
    return [] as ProductPrice[]
  }

  const response = await api.get<ProductPrice[]>(`/api/products/prices?product_ids=${productIds.join(',')}`)
  return response.data
}
