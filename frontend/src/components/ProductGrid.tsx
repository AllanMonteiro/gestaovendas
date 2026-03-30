import React, { useMemo, useRef } from 'react'

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
}

type ProductGridProps = {
  categories: Category[]
  selectedCategoryId: number | null
  products: Product[]
  allProducts: Product[]
  searchTerm: string
  searchResultProducts: Product[]
  categoryImages?: Record<string, string>
  onSelectCategory: (id: number | null) => void
  onSearchTermChange: (value: string) => void
  onAddProduct: (product: Product) => void
}

const ProductGridComponent: React.FC<ProductGridProps> = ({
  categories,
  selectedCategoryId,
  products,
  allProducts,
  searchTerm,
  searchResultProducts,
  categoryImages = {},
  onSelectCategory,
  onSearchTermChange,
  onAddProduct
}) => {
  const productsSectionRef = useRef<HTMLDivElement | null>(null)

  const categorySummaries = useMemo(() => {
    const summaries = new Map<number, { count: number; stock: string | number }>()
    allProducts.forEach((product) => {
      if (product.active === false) {
        return
      }
      const current = summaries.get(product.category)
      if (!current) {
        summaries.set(product.category, {
          count: 1,
          stock: product.stock ?? 0,
        })
        return
      }
      summaries.set(product.category, {
        count: current.count + 1,
        stock: current.stock,
      })
    })
    return summaries
  }, [allProducts])

  const selectedCategoryName = useMemo(() => {
    if (selectedCategoryId === null) {
      return 'Todas as categorias'
    }
    return categories.find((category) => category.id === selectedCategoryId)?.name || 'Categoria'
  }, [categories, selectedCategoryId])

  const totalVisibleProducts = products.filter((product) => product.active !== false).length

  const getCategoryInitials = (value: string) =>
    value
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('')

  const handleCategoryClick = (categoryId: number | null) => {
    onSelectCategory(categoryId)
    onSearchTermChange('')
    window.requestAnimationFrame(() => {
      productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-brand-100 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Filtro</p>
            <p className="text-sm font-semibold text-slate-700">{selectedCategoryName}</p>
            <p className="mt-1 text-xs text-slate-500">Clique em uma categoria para ir direto aos produtos dela.</p>
          </div>
          {selectedCategoryId !== null ? (
            <button
              type="button"
              onClick={() => handleCategoryClick(null)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
            >
              Ver todas
            </button>
          ) : (
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              {allProducts.length} itens
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => handleCategoryClick(null)}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              selectedCategoryId === null ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300'
            }`}
          >
            <p className="text-sm font-semibold">Todas</p>
            <p className="mt-1 text-xs text-slate-500">Mostra todo o catalogo para adicionar ao pedido.</p>
          </button>
          {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              onClick={() => handleCategoryClick(category.id)}
              className={`rounded-2xl border p-3 text-left transition ${
                selectedCategoryId === category.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-brand-100 bg-slate-100 text-sm font-bold text-slate-500">
                  {categoryImages[String(category.id)] ? (
                    <img
                      src={categoryImages[String(category.id)]}
                      alt={category.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    getCategoryInitials(category.name)
                  )}
                </div>
                <div className="min-w-0">
                  <p className={`truncate text-sm font-semibold ${selectedCategoryId === category.id ? 'text-brand-700' : 'text-slate-700'}`}>
                    {category.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {categorySummaries.get(category.id)?.count ?? 0} produtos
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div ref={productsSectionRef} className="rounded-2xl border border-brand-100 bg-white p-3 shadow-sm">
        <div className="sticky top-2 z-20 -mx-1 mb-4 rounded-2xl bg-white/95 px-1 pb-3 backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Produtos</p>
              <p className="text-sm font-semibold text-slate-700">
                {selectedCategoryId === null ? 'Escolha um item para adicionar' : `Itens de ${selectedCategoryName}`}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {totalVisibleProducts} visiveis
            </span>
          </div>

          <div className="relative rounded-2xl border border-brand-100 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => onSearchTermChange(event.target.value)}
                placeholder="Pesquisar produto..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-400"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => onSearchTermChange('')}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-700"
                >
                  Limpar
                </button>
              ) : null}
            </div>

            {searchTerm && searchResultProducts.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg z-30">
                {searchResultProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => {
                      onAddProduct(product)
                      onSearchTermChange('')
                    }}
                    className="w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-brand-50 last:border-0"
                  >
                    <div className="flex justify-between items-center">
                      <div className="text-sm font-semibold text-slate-800">{product.name}</div>
                      <div className="text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                        Estoque: {String(product.stock ?? 0)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searchTerm && searchResultProducts.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-slate-200 bg-white p-4 shadow-lg z-30 text-center text-sm text-slate-500">
                Nenhum produto encontrado.
              </div>
            )}
          </div>
        </div>

        {totalVisibleProducts === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Nenhum produto encontrado nesta categoria.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {products
              .filter((product) => product.active !== false)
              .map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onAddProduct(product)}
                  className="rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{product.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Estoque: {String(product.stock ?? 0)}
                      </p>
                    </div>
                    <span className="rounded-full bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700">
                      {product.sold_by_weight ? 'Peso' : 'Adicionar'}
                    </span>
                  </div>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

export const ProductGrid = React.memo(ProductGridComponent)

