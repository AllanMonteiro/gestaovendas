import { api } from '../../core/api'
import type { Category, Product, ProductPrice, ProductStockEntry } from './types'

export type CreateCategoryInput = {
  name: string
  sort_order: number
  active: boolean
}

export type CreateProductInput = {
  category: number
  name: string
  active: boolean
  sold_by_weight: boolean
  stock: string
  price: string
  cost: string
  freight: string
  other: string
  tax_pct: string
  overhead_pct: string
  margin_pct: string
}

export type UpdateProductInput = {
  id: number
  category: number
  name: string
  active: boolean
  sold_by_weight: boolean
  stock: string
  price: string
  cost: string
  freight: string
  other: string
  tax_pct: string
  overhead_pct: string
  margin_pct: string
}

export type ToggleProductActiveInput = {
  product: Product
}

export type UpdateProductPriceInput = {
  productId: number
  price: string | number
  cost: string | number
}

export type ProductMutationResult = {
  product: Product
  price: ProductPrice
}

export type CreateProductStockEntryInput = {
  productId: number
  arrival_date: string
  quantity: string
}

export const createCategory = async (input: CreateCategoryInput) => {
  const response = await api.post<Category>('/api/categories', input)
  return response.data
}

export const deleteCategory = async (categoryId: number) => {
  await api.delete(`/api/categories/${categoryId}`)
  return categoryId
}

export const createProduct = async (input: CreateProductInput): Promise<ProductMutationResult> => {
  const createResp = await api.post<Product>('/api/products', {
    category: input.category,
    name: input.name,
    active: input.active,
    sold_by_weight: input.sold_by_weight,
    stock: input.stock,
  })

  const product = createResp.data
  const priceResp = await api.put<ProductPrice>(`/api/products/${product.id}/price`, {
    price: input.price,
    cost: input.cost,
    freight: input.freight,
    other: input.other,
    tax_pct: input.tax_pct,
    overhead_pct: input.overhead_pct,
    margin_pct: input.margin_pct,
  })

  return {
    product,
    price: priceResp.data,
  }
}

export const updateProduct = async (input: UpdateProductInput): Promise<ProductMutationResult> => {
  const productResp = await api.put<Product>(`/api/products/${input.id}`, {
    category: input.category,
    name: input.name,
    active: input.active,
    sold_by_weight: input.sold_by_weight,
    stock: input.stock,
  })

  const priceResp = await api.put<ProductPrice>(`/api/products/${input.id}/price`, {
    price: input.price,
    cost: input.cost,
    freight: input.freight,
    other: input.other,
    tax_pct: input.tax_pct,
    overhead_pct: input.overhead_pct,
    margin_pct: input.margin_pct,
  })

  return {
    product: productResp.data,
    price: priceResp.data,
  }
}

export const toggleProductActive = async ({ product }: ToggleProductActiveInput) => {
  const response = await api.put<Product>(`/api/products/${product.id}`, {
    category: product.category,
    name: product.name,
    active: !product.active,
    sold_by_weight: product.sold_by_weight,
    stock: product.stock,
  })
  return response.data
}

export const updateProductPrice = async (input: UpdateProductPriceInput) => {
  const response = await api.put<ProductPrice>(`/api/products/${input.productId}/price`, {
    price: input.price,
    cost: input.cost,
  })
  return response.data
}

export const createProductStockEntry = async (input: CreateProductStockEntryInput) => {
  const response = await api.post<ProductStockEntry>(`/api/products/${input.productId}/stock-entries`, {
    arrival_date: input.arrival_date,
    quantity: input.quantity,
  })
  return response.data
}
