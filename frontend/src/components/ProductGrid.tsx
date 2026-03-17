import React from 'react'

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
}

type ProductGridProps = {
  categories: Category[]
  selectedCategoryId: number | null
  products: Product[]
  allProducts: Product[]
  searchTerm: string
  categoryImages?: Record<string, string>
  onSelectCategory: (id: number | null) => void
  onSearchTermChange: (value: string) => void
  onAddProduct: (product: Product) => void
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  categories,
  selectedCategoryId,
  products,
  allProducts,
  searchTerm,
  categoryImages = {},
  onSelectCategory,
  onSearchTermChange,
  onAddProduct
}) => {
  const categoryProductLabel = (categoryId: number) => {
    const sample = allProducts.find((product) => product.category === categoryId && product.active !== false)
    return sample?.name || 'Sem produto vinculado'
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-brand-100 bg-white p-3 shadow-sm">
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
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          onClick={() => onSelectCategory(null)}
          className={`rounded-xl border px-3 py-2 text-left transition ${
            selectedCategoryId === null ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300'
          }`}
        >
          <span className="text-sm font-semibold">Todas</span>
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category.id)}
            className={`rounded-xl border p-2 text-left transition ${
              selectedCategoryId === category.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-brand-100 bg-slate-100">
                {categoryImages[String(category.id)] ? (
                  <img
                    src={categoryImages[String(category.id)]}
                    alt={category.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-lg text-slate-400">+</div>
                )}
              </div>
              <div className="min-w-0">
                <p className={`truncate text-sm font-semibold ${selectedCategoryId === category.id ? 'text-brand-700' : 'text-slate-700'}`}>
                  {category.name}
                </p>
                <p className="truncate text-xs text-slate-500">{categoryProductLabel(category.id)}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {products.map((product) => (
          <button
            key={product.id}
            onClick={() => onAddProduct(product)}
            className="rounded-xl border border-brand-100 bg-gradient-to-b from-white to-brand-50/40 p-3 text-left transition hover:-translate-y-0.5 hover:shadow sm:min-h-[92px]"
          >
            <div className="line-clamp-2 text-sm font-semibold text-slate-800">{product.name}</div>
            <div className="mt-2 inline-flex rounded-full bg-brand-100 px-2 py-1 text-xs font-semibold text-brand-700">
              Adicionar
            </div>
          </button>
        ))}
      </div>
      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
          Nenhum produto encontrado para essa pesquisa.
        </div>
      ) : null}
    </div>
  )
}

