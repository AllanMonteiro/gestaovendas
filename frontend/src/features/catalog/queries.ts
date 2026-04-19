import { api } from '../../core/api'
import { getCategories, getProducts, saveCategories, saveProducts } from '../../offline/catalog'
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
  try {
    const response = await api.get<Product[]>('/api/products')
    const products = sortProducts(response.data)
    await saveProducts(products)
    return products
  } catch (error) {
    const cachedProducts = sortProducts((await getProducts()) as Product[])
    if (cachedProducts.length > 0) {
      return cachedProducts
    }
    throw error
  }
}

export const listCategories = async () => {
  try {
    const response = await api.get<Category[]>('/api/categories')
    const categories = sortCategories(response.data)
    await saveCategories(categories)
    return categories
  } catch (error) {
    const cachedCategories = sortCategories((await getCategories()) as Category[])
    if (cachedCategories.length > 0) {
      return cachedCategories
    }
    throw error
  }
}

export const listProductPrices = async (productIds: number[]) => {
  if (productIds.length === 0) {
    return [] as ProductPrice[]
  }

  const response = await api.get<ProductPrice[]>(`/api/products/prices?product_ids=${productIds.join(',')}`)
  return response.data
}
