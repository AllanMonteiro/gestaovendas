import React, { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { resolveAssetUrl } from '../app/runtime'
import { EmptyState } from './ui'

type Category = {
  id: number
  name: string
}

type Product = {
  id: number
  name: string
  category: number
  sold_by_weight?: boolean
  active?: boolean
  stock?: string | number
  price?: string | number
}

type ProductGridProps = {
  categories: Category[]
  selectedCategoryId: number | null
  products: Product[]
  allProducts: Product[]
  categoryImages?: Record<string, string>
  onSelectCategory: (id: number | null) => void
  onAddProduct: (product: Product) => void
}

const formatBRL = (value: string | number) => {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const GRADIENTS = [
  'from-orange-100 to-orange-200 text-orange-700',
  'from-pink-100 to-pink-200 text-pink-700',
  'from-purple-100 to-purple-200 text-purple-700',
  'from-blue-100 to-blue-200 text-blue-700',
  'from-emerald-100 to-emerald-200 text-emerald-700',
  'from-amber-100 to-amber-200 text-amber-700',
  'from-cyan-100 to-cyan-200 text-cyan-700',
]

const getGradientClass = (id: number) => GRADIENTS[id % GRADIENTS.length]

const getCategoryInitials = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')

const ProductGridComponent: React.FC<ProductGridProps> = ({
  categories,
  selectedCategoryId,
  products,
  categoryImages = {},
  onSelectCategory,
  onAddProduct
}) => {
  const [failedCategoryImages, setFailedCategoryImages] = useState<Record<string, boolean>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const deferredSearchTerm = useDeferredValue(searchTerm)

  useEffect(() => {
    setFailedCategoryImages({})
  }, [categoryImages])

  const normalizedSearch = deferredSearchTerm.trim().toLowerCase()

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (product.active === false) return false
      if (normalizedSearch && !product.name.toLowerCase().includes(normalizedSearch)) return false
      return true
    })
  }, [products, normalizedSearch])

  const handleCategoryImageError = (categoryId: number) => {
    setFailedCategoryImages((prev) => ({
      ...prev,
      [String(categoryId)]: true,
    }))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de Busca Premium */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
        </div>
        <input
          type="text"
          className="block w-full rounded-2xl border-2 border-transparent bg-white/60 backdrop-blur-xl py-3.5 pl-11 pr-4 text-[15px] font-medium text-slate-800 shadow-sm outline-none transition-all focus:border-brand-500 focus:bg-white focus:shadow-md focus:ring-4 focus:ring-brand-500/10 placeholder:text-slate-400"
          placeholder="Buscar produtos por nome..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 hover:text-slate-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        )}
      </div>

      {/* Categorias */}
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2 scrollbar-thin scrollbar-thumb-slate-300">
        <button
          type="button"
          onClick={() => onSelectCategory(null)}
          className={`shrink-0 rounded-full border px-5 py-2.5 text-[14px] font-semibold transition-all duration-300 flex items-center gap-2 ${
            selectedCategoryId === null
              ? 'border-brand-500 bg-brand-500 text-white shadow-[0_4px_12px_rgba(255,90,36,0.25)]'
              : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-slate-800 hover:shadow-sm hover:-translate-y-0.5'
          }`}
        >
          🌟 Todas
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelectCategory(category.id)}
            className={`shrink-0 rounded-full border px-5 py-2.5 text-[14px] font-semibold transition-all duration-300 flex items-center gap-2 ${
              selectedCategoryId === category.id
                ? 'border-brand-500 bg-brand-500 text-white shadow-[0_4px_12px_rgba(255,90,36,0.25)]'
                : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-slate-800 hover:shadow-sm hover:-translate-y-0.5'
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>

      {/* Grid de Produtos */}
      {filteredProducts.length === 0 ? (
        <EmptyState
          title="Nenhum produto encontrado"
          description={searchTerm ? "Tente buscar por outro termo." : "Nao existem itens ativos nesta categoria no momento."}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-4 pb-6">
          {filteredProducts.map((product) => {
            const gradient = getGradientClass(product.category)
            const imgUrl = categoryImages[String(product.category)] && !failedCategoryImages[String(product.category)]
              ? resolveAssetUrl(categoryImages[String(product.category)])
              : null

            return (
              <button
                key={product.id}
                type="button"
                onClick={() => onAddProduct(product)}
                className="group relative flex flex-col items-center justify-center overflow-hidden rounded-[12px] border border-slate-200 bg-white p-2.5 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-[0_8px_16px_-4px_rgba(255,90,36,0.15),_0_0_0_2px_rgba(255,90,36,1)] active:scale-[0.98] min-h-[70px]"
              >
                <div className="flex w-full flex-1 flex-col justify-center">
                  <h3 className="mb-1 text-[13px] font-bold leading-tight text-slate-800 line-clamp-2 flex items-center justify-center gap-1">
                    {product.name}
                    {product.sold_by_weight && (
                      <span className="text-[12px]" title="Vendido por peso">⚖️</span>
                    )}
                  </h3>
                  
                  {/* Estoque */}
                  {product.stock != null && Number(product.stock) > 0 ? (
                    <p className="mb-2 text-[11px] font-semibold text-slate-400">
                      Estoque: {String(product.stock)}
                    </p>
                  ) : (
                    <div className="flex-1" />
                  )}

                  {/* Preço (se existir) */}
                  <div className="mt-1">
                    {product.price != null ? (
                      <div className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-[14px] font-extrabold text-brand-600 transition-colors group-hover:bg-brand-100">
                        {formatBRL(product.price)}
                      </div>
                    ) : (
                      <div className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[12px] font-bold text-slate-500">
                        Adicionar
                      </div>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export const ProductGrid = React.memo(ProductGridComponent)
