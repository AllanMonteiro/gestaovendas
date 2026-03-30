import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'

type Category = {
  id: number
  name: string
  price?: string | null
}

type Product = {
  id: number
  category: number
  name: string
  active: boolean
  sold_by_weight: boolean
  stock: string | number
}

type ProductPrice = {
  id?: number
  product?: number
  price: string
  cost: string
  freight: string
  other: string
  tax_pct: string
  overhead_pct: string
  margin_pct: string
  ideal_price: string
  profit: string
}

const formatBRL = (value: string | number) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const getApiErrorText = (error: unknown, fallback: string) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail === 'string'
  ) {
    return (error as { response: { data: { detail: string } } }).response.data.detail
  }
  return fallback
}

const Produtos: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [priceMap, setPriceMap] = useState<Record<number, ProductPrice>>({})
  const [feedback, setFeedback] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false)
  const [showDeleteCategoryModal, setShowDeleteCategoryModal] = useState(false)
  const [createCategory, setCreateCategory] = useState('')
  const [createName, setCreateName] = useState('')
  const [createCost, setCreateCost] = useState('0,00')
  const [createFreight, setCreateFreight] = useState('0,00')
  const [createOther, setCreateOther] = useState('0,00')
  const [createTaxPct, setCreateTaxPct] = useState('0,00')
  const [createOverheadPct, setCreateOverheadPct] = useState('0,00')
  const [createPrice, setCreatePrice] = useState('0,00')
  const [createMarginPct, setCreateMarginPct] = useState('30,00')
  const [createSoldByWeight, setCreateSoldByWeight] = useState(false)
  const [createActive, setCreateActive] = useState(true)
  const [createStock, setCreateStock] = useState('0,000')
  const [createCategoryName, setCreateCategoryName] = useState('')
  const [createCategorySortOrder, setCreateCategorySortOrder] = useState('0')
  const [createCategoryActive, setCreateCategoryActive] = useState(true)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [deleteCategoryId, setDeleteCategoryId] = useState('')
  const [deletingCategory, setDeletingCategory] = useState(false)
  const [creatingProduct, setCreatingProduct] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editSoldByWeight, setEditSoldByWeight] = useState(false)
  const [editCost, setEditCost] = useState('0,00')
  const [editFreight, setEditFreight] = useState('0,00')
  const [editOther, setEditOther] = useState('0,00')
  const [editTaxPct, setEditTaxPct] = useState('0,00')
  const [editOverheadPct, setEditOverheadPct] = useState('0,00')
  const [editPrice, setEditPrice] = useState('0,00')
  const [editMarginPct, setEditMarginPct] = useState('30,00')
  const [editStock, setEditStock] = useState('0,000')
  const [savingEdit, setSavingEdit] = useState(false)

  const categoryById = useMemo(() => {
    const map = new Map<number, string>()
    categories.forEach((category) => map.set(category.id, category.name))
    return map
  }, [categories])

  const categoryPriceById = useMemo(() => {
    const map = new Map<number, string>()
    categories.forEach((category) => map.set(category.id, String(category.price || '0')))
    return map
  }, [categories])

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    if (!normalizedSearch) {
      return products
    }
    return products.filter((product) => {
      const categoryName = categoryById.get(product.category) || ''
      return `${product.name} ${categoryName}`.toLowerCase().includes(normalizedSearch)
    })
  }, [categoryById, products, searchTerm])

  const selectedDeleteCategory = useMemo(
    () => categories.find((category) => String(category.id) === deleteCategoryId) ?? null,
    [categories, deleteCategoryId]
  )

  const selectedDeleteCategoryProductsCount = useMemo(() => {
    if (!deleteCategoryId) {
      return 0
    }
    return products.filter((product) => String(product.category) === deleteCategoryId).length
  }, [deleteCategoryId, products])

  const loadData = async () => {
    try {
      const [productsResp, categoriesResp] = await Promise.all([
        api.get<Product[]>('/api/products'),
        api.get<Category[]>('/api/categories')
      ])
      setProducts(productsResp.data)
      setCategories(categoriesResp.data)

      const fallbackMap = Object.fromEntries(
        productsResp.data.map((product) => [
          product.id,
          {
            price: String(categoriesResp.data.find((category) => category.id === product.category)?.price || '0'),
            cost: '0',
            freight: '0',
            other: '0',
            tax_pct: '0',
            overhead_pct: '0',
            margin_pct: '0',
            ideal_price: '0',
            profit: '0'
          } satisfies ProductPrice
        ])
      )

      const productIds = productsResp.data.map((product) => product.id)
      const productIdSet = new Set(productIds)

      try {
        const priceQuery = productIds.join(',')
        const pricesResp = priceQuery
          ? await api.get<ProductPrice[]>(`/api/products/prices?product_ids=${priceQuery}`)
          : { data: [] as ProductPrice[] }
        const mapped = Object.fromEntries(
          pricesResp.data
            .filter((price) => typeof price.product === 'number' && productIdSet.has(Number(price.product)))
            .map((price) => [Number(price.product), price])
        )
        setPriceMap({ ...fallbackMap, ...mapped })
      } catch {
        setPriceMap(fallbackMap)
      }
    } catch {
      setFeedback('Falha ao carregar produtos.')
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const toDecimal = (value: string) => value.replace(',', '.').trim()

  const toNumber = (value: string) => Number(toDecimal(value) || '0')

  const formatInputBRL = (value: number) =>
    value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const applyCategoryDefaults = (categoryId: number) => {
    const referenceProduct = products.find(p => p.category === categoryId)
    const categoryBasePrice = Number(categoryPriceById.get(categoryId) || '0')
    if (referenceProduct && priceMap[referenceProduct.id]) {
      const pInfo = priceMap[referenceProduct.id]
      setCreateCost(formatInputBRL(Number(pInfo.cost || 0)))
      setCreateFreight(formatInputBRL(Number(pInfo.freight || 0)))
      setCreateOther(formatInputBRL(Number(pInfo.other || 0)))
      setCreateTaxPct(formatInputBRL(Number(pInfo.tax_pct || 0)))
      setCreateOverheadPct(formatInputBRL(Number(pInfo.overhead_pct || 0)))
      setCreateMarginPct(formatInputBRL(Number(pInfo.margin_pct || 0)))
      setCreatePrice(formatInputBRL(Number(pInfo.price || categoryBasePrice)))
      setCreateSoldByWeight(referenceProduct.sold_by_weight)
    } else {
      setCreateCost('0,00')
      setCreateFreight('0,00')
      setCreateOther('0,00')
      setCreateTaxPct('0,00')
      setCreateOverheadPct('0,00')
      setCreatePrice(formatInputBRL(categoryBasePrice))
      setCreateMarginPct('30,00')
      setCreateSoldByWeight(false)
    }
    setCreateStock('0,000') // Default new product stock to 0
  }

  const resetCreateForm = () => {
    const firstCatId = categories[0]?.id ?? ''
    setCreateCategory(String(firstCatId))
    setCreateName('')
    if (firstCatId) {
      applyCategoryDefaults(Number(firstCatId))
    } else {
      setCreateCost('0,00')
      setCreateFreight('0,00')
      setCreateOther('0,00')
      setCreateTaxPct('0,00')
      setCreateOverheadPct('0,00')
      setCreatePrice('0,00')
      setCreateMarginPct('30,00')
      setCreateSoldByWeight(false)
      setCreateStock('0,000')
    }
    setCreateActive(true)
  }

  const openCreateProductModal = () => {
    if (categories.length === 0) {
      setFeedback('Cadastre ao menos uma categoria antes de criar produto. Use o botao "Nova Categoria".')
      return
    }
    resetCreateForm()
    setShowCreateModal(true)
  }

  const openCreateCategoryModal = () => {
    setCreateCategoryName('')
    setCreateCategorySortOrder(String(categories.length))
    setCreateCategoryActive(true)
    setShowCreateCategoryModal(true)
  }

  const openDeleteCategoryModal = () => {
    if (categories.length === 0) {
      setFeedback('Nao ha categorias cadastradas para excluir.')
      return
    }
    setDeleteCategoryId(String(categories[0].id))
    setShowDeleteCategoryModal(true)
  }

  const handleCreateCategory = async () => {
    if (!createCategoryName.trim()) {
      setFeedback('Informe o nome da categoria.')
      return
    }
    const sortOrder = Number(createCategorySortOrder || '0')
    if (!Number.isFinite(sortOrder) || sortOrder < 0) {
      setFeedback('Ordem da categoria invalida.')
      return
    }

    setCreatingCategory(true)
    try {
      const response = await api.post<Category>('/api/categories', {
        name: createCategoryName.trim(),
        sort_order: sortOrder,
        active: createCategoryActive
      })
      setFeedback('Categoria criada com sucesso.')
      setShowCreateCategoryModal(false)
      if (!createCategory) {
        setCreateCategory(String(response.data.id))
      }
      await loadData()
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao criar categoria.'))
    } finally {
      setCreatingCategory(false)
    }
  }

  const handleDeleteCategory = async () => {
    if (!deleteCategoryId) {
      setFeedback('Selecione uma categoria para excluir.')
      return
    }

    if (selectedDeleteCategoryProductsCount > 0) {
      setFeedback('Remova ou mova os produtos desta categoria antes de exclui-la.')
      return
    }

    const categoryName = selectedDeleteCategory?.name || 'esta categoria'
    const confirmed = window.confirm(`Excluir ${categoryName}? Essa acao nao pode ser desfeita.`)
    if (!confirmed) {
      return
    }

    setDeletingCategory(true)
    try {
      await api.delete(`/api/categories/${deleteCategoryId}`)
      setFeedback('Categoria excluida com sucesso.')
      setShowDeleteCategoryModal(false)
      setDeleteCategoryId('')
      await loadData()
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao excluir categoria.'))
    } finally {
      setDeletingCategory(false)
    }
  }

  const handleApplyIdealPriceOnCreate = () => {
    const costBase = toNumber(createCost) + toNumber(createFreight) + toNumber(createOther)
    const pctTotal = (toNumber(createTaxPct) + toNumber(createOverheadPct) + toNumber(createMarginPct)) / 100
    if (pctTotal >= 1) {
      setFeedback('Percentuais invalidos para preco ideal (total deve ser menor que 100%).')
      return
    }
    const ideal = costBase / (1 - pctTotal)
    setCreatePrice(formatInputBRL(ideal))
  }

  const handleCreateProduct = async () => {
    if (!createName.trim()) {
      setFeedback('Informe o nome do produto.')
      return
    }

    const categoryId = Number(createCategory)
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      setFeedback('Categoria invalida.')
      return
    }

    setCreatingProduct(true)

    try {
      const createResp = await api.post<Product>('/api/products', {
        category: categoryId,
        name: createName.trim(),
        active: createActive,
        sold_by_weight: createSoldByWeight,
        stock: toDecimal(createStock || '0')
      })

      await api.put(`/api/products/${createResp.data.id}/price`, {
        price: toDecimal(createPrice || '0'),
        cost: toDecimal(createCost || '0'),
        freight: toDecimal(createFreight || '0'),
        other: toDecimal(createOther || '0'),
        tax_pct: toDecimal(createTaxPct || '0'),
        overhead_pct: toDecimal(createOverheadPct || '0'),
        margin_pct: toDecimal(createMarginPct || '0')
      })

      setFeedback('Produto criado com sucesso.')
      setShowCreateModal(false)
      await loadData()
    } catch {
      setFeedback('Falha ao criar produto.')
    } finally {
      setCreatingProduct(false)
    }
  }

  const handleSetPrice = async (product: Product) => {
    const currentPrice = priceMap[product.id]?.price || '0'
    const priceInput = window.prompt(`Novo preco para ${product.name}:`, String(currentPrice))
    if (!priceInput) {
      return
    }

    try {
      await api.put(`/api/products/${product.id}/price`, {
        price: priceInput.replace(',', '.'),
        cost: priceMap[product.id]?.cost || '0'
      })
      setFeedback('Preco atualizado.')
      await loadData()
    } catch {
      setFeedback('Falha ao atualizar preco.')
    }
  }

  const handleApplyIdealPrice = async (product: Product) => {
    const info = priceMap[product.id]
    if (!info) {
      setFeedback('Preco ideal indisponivel para este produto.')
      return
    }
    try {
      await api.put(`/api/products/${product.id}/price`, {
        price: info.ideal_price,
        cost: info.cost
      })
      setFeedback('Preco ideal aplicado.')
      await loadData()
    } catch {
      setFeedback('Falha ao aplicar preco ideal.')
    }
  }

  const handleToggleActive = async (product: Product) => {
    try {
      await api.put(`/api/products/${product.id}`, {
        category: product.category,
        name: product.name,
        active: !product.active,
        sold_by_weight: product.sold_by_weight,
        stock: product.stock
      })
      setFeedback('Status do produto atualizado.')
      await loadData()
    } catch {
      setFeedback('Falha ao alterar status do produto.')
    }
  }

  const openEditProduct = (product: Product) => {
    const pricing = priceMap[product.id]
    setEditingProduct(product)
    setEditName(product.name)
    setEditCategory(String(product.category))
    setEditSoldByWeight(product.sold_by_weight)
    setEditStock(String(product.stock || '0'))
    setEditCost(formatInputBRL(Number(pricing?.cost || '0')))
    setEditFreight(formatInputBRL(Number(pricing?.freight || '0')))
    setEditOther(formatInputBRL(Number(pricing?.other || '0')))
    setEditTaxPct(formatInputBRL(Number(pricing?.tax_pct || '0')))
    setEditOverheadPct(formatInputBRL(Number(pricing?.overhead_pct || '0')))
    setEditPrice(formatInputBRL(Number(pricing?.price || '0')))
    setEditMarginPct(formatInputBRL(Number(pricing?.margin_pct || '0')))
  }

  const handleSaveEditProduct = async () => {
    if (!editingProduct) {
      return
    }
    if (!editName.trim()) {
      setFeedback('Informe o nome do produto.')
      return
    }
    const categoryId = Number(editCategory)
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      setFeedback('Categoria invalida para edicao do produto.')
      return
    }

    setSavingEdit(true)
    try {
      const payload = {
        category: categoryId,
        name: editName.trim(),
        active: editingProduct.active,
        sold_by_weight: editSoldByWeight,
        stock: toDecimal(editStock || '0')
      }
      await api.put(`/api/products/${editingProduct.id}`, payload)
      await api.put(`/api/products/${editingProduct.id}/price`, {
        price: toDecimal(editPrice || '0'),
        cost: toDecimal(editCost || '0'),
        freight: toDecimal(editFreight || '0'),
        other: toDecimal(editOther || '0'),
        tax_pct: toDecimal(editTaxPct || '0'),
        overhead_pct: toDecimal(editOverheadPct || '0'),
        margin_pct: toDecimal(editMarginPct || '0')
      })
      setFeedback('Produto atualizado com sucesso.')
      setEditingProduct(null)
      await loadData()
    } catch {
      setFeedback('Falha ao atualizar produto.')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleApplyIdealPriceOnEdit = () => {
    const costBase = toNumber(editCost) + toNumber(editFreight) + toNumber(editOther)
    const pctTotal = (toNumber(editTaxPct) + toNumber(editOverheadPct) + toNumber(editMarginPct)) / 100
    if (pctTotal >= 1) {
      setFeedback('Percentuais invalidos para preco ideal (total deve ser menor que 100%).')
      return
    }
    const ideal = costBase / (1 - pctTotal)
    setEditPrice(formatInputBRL(ideal))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Produtos</h2>
          <p className="text-sm text-slate-500">
            {filteredProducts.length} produto(s) encontrado(s)
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Pesquisar produto ou categoria"
            className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm sm:w-72"
          />
          {searchTerm ? (
            <button
              onClick={() => setSearchTerm('')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
            >
              Limpar
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex gap-2">
          <button onClick={() => void loadData()} className="px-3 py-2 rounded-lg border border-brand-200 text-brand-700">
            Atualizar
          </button>
          <button onClick={openCreateCategoryModal} className="px-3 py-2 rounded-lg border border-brand-300 text-brand-700">
            Nova Categoria
          </button>
          <button onClick={openDeleteCategoryModal} className="px-3 py-2 rounded-lg border border-rose-300 text-rose-700">
            Apagar Categoria
          </button>
          <button onClick={() => openCreateProductModal()} className="px-3 py-2 rounded-lg bg-brand-600 text-white">
            Novo Produto
          </button>
        </div>
      </div>

      {feedback ? <p className="text-sm text-brand-700">{feedback}</p> : null}

      <div className="panel p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-2">Produto</th>
              <th className="pb-2">Categoria</th>
              <th className="pb-2 text-right">Estoque</th>
              <th className="pb-2">Preco</th>
              <th className="pb-2">Ideal</th>
              <th className="pb-2">Lucro</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  Nenhum produto encontrado para a pesquisa informada.
                </td>
              </tr>
            ) : filteredProducts.map((product) => {
              const pricing = priceMap[product.id]
              return (
                <tr key={product.id} className="border-t border-brand-100">
                  <td className="py-2">{product.name}</td>
                  <td className="py-2">{categoryById.get(product.category) || product.category}</td>
                  <td className="py-2 text-right">{String(product.stock || '0')}</td>
                  <td className="py-2">{formatBRL(pricing?.price || '0')}</td>
                  <td className="py-2">{formatBRL(pricing?.ideal_price || '0')}</td>
                  <td className="py-2">{formatBRL(pricing?.profit || '0')}</td>
                  <td className="py-2">{product.active ? 'Ativo' : 'Inativo'}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void handleSetPrice(product)} className="rounded px-2 py-1 border border-brand-200 text-brand-700">
                        Preco
                      </button>
                      <button onClick={() => openEditProduct(product)} className="rounded px-2 py-1 border border-indigo-300 text-indigo-700">
                        Editar
                      </button>
                      <button onClick={() => void handleApplyIdealPrice(product)} className="rounded px-2 py-1 border border-emerald-300 text-emerald-700">
                        Aplicar ideal
                      </button>
                      <button onClick={() => void handleToggleActive(product)} className="rounded px-2 py-1 border border-slate-300 text-slate-700">
                        {product.active ? 'Inativar' : 'Ativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editingProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-lg font-semibold">Editar produto</h3>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div>
                <label className="text-xs text-slate-600">Categoria</label>
                <select
                  value={editCategory}
                  onChange={(event) => setEditCategory(event.target.value)}
                  className="mt-1 w-full border border-brand-100 rounded-lg px-3 py-2 bg-white text-sm"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={String(category.id)}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-600">Produto</label>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="mt-1 w-full border border-brand-100 rounded-lg px-3 py-2 text-sm"
                  placeholder="Nome do produto"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600">Estoque Atual</label>
                <input value={editStock} onChange={(event) => setEditStock(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Custo</label>
                <input value={editCost} onChange={(event) => setEditCost(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Frete</label>
                <input value={editFreight} onChange={(event) => setEditFreight(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Outros</label>
                <input value={editOther} onChange={(event) => setEditOther(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Imposto %</label>
                <input value={editTaxPct} onChange={(event) => setEditTaxPct(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Func/Admin %</label>
                <input value={editOverheadPct} onChange={(event) => setEditOverheadPct(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Venda atual</label>
                <input value={editPrice} onChange={(event) => setEditPrice(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Margem desejada %</label>
                <input value={editMarginPct} onChange={(event) => setEditMarginPct(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editSoldByWeight}
                    onChange={(event) => setEditSoldByWeight(event.target.checked)}
                  />
                  Vendido por kg
                </label>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm">
              <span>
                Custo total: {formatBRL(toNumber(editCost) + toNumber(editFreight) + toNumber(editOther))}
              </span>
              <span>
                Lucro estimado: {formatBRL(toNumber(editPrice) - (toNumber(editCost) + toNumber(editFreight) + toNumber(editOther)))}
              </span>
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <button
                onClick={handleApplyIdealPriceOnEdit}
                className="rounded-lg border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700"
              >
                Aplicar preco ideal
              </button>
              <div className="flex gap-2">
              <button
                onClick={() => setEditingProduct(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                disabled={savingEdit}
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleSaveEditProduct()}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={savingEdit}
              >
                {savingEdit ? 'Salvando...' : 'Salvar'}
              </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-lg font-semibold">Cadastrar produto</h3>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div>
                <label className="text-xs text-slate-600">Categoria</label>
                <select
                  value={createCategory}
                  onChange={(event) => {
                    const val = event.target.value
                    setCreateCategory(val)
                    if (val) {
                      applyCategoryDefaults(Number(val))
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm bg-white"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={String(category.id)}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-600">Produto</label>
                <input
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder="Ex: Acai 500ml"
                  className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600">Estoque Inicial</label>
                <input value={createStock} onChange={(event) => setCreateStock(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Custo</label>
                <input value={createCost} onChange={(event) => setCreateCost(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Frete</label>
                <input value={createFreight} onChange={(event) => setCreateFreight(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Outros</label>
                <input value={createOther} onChange={(event) => setCreateOther(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Imposto %</label>
                <input value={createTaxPct} onChange={(event) => setCreateTaxPct(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Func/Admin %</label>
                <input value={createOverheadPct} onChange={(event) => setCreateOverheadPct(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Venda atual</label>
                <input value={createPrice} onChange={(event) => setCreatePrice(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-600">Margem desejada %</label>
                <input value={createMarginPct} onChange={(event) => setCreateMarginPct(event.target.value)} className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm" />
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={createSoldByWeight} onChange={(event) => setCreateSoldByWeight(event.target.checked)} />
                  Vendido por kg
                </label>
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={createActive} onChange={(event) => setCreateActive(event.target.checked)} />
                  Ativo
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm">
              <span>
                Custo total: {formatBRL(toNumber(createCost) + toNumber(createFreight) + toNumber(createOther))}
              </span>
              <span>
                Lucro estimado: {formatBRL(toNumber(createPrice) - (toNumber(createCost) + toNumber(createFreight) + toNumber(createOther)))}
              </span>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <button
                onClick={handleApplyIdealPriceOnCreate}
                className="rounded-lg border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700"
              >
                Aplicar preco ideal
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                  disabled={creatingProduct}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void handleCreateProduct()}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={creatingProduct}
                >
                  {creatingProduct ? 'Salvando...' : 'Salvar produto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showCreateCategoryModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-lg font-semibold">Cadastrar categoria</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-600">Nome da categoria</label>
                <input
                  value={createCategoryName}
                  onChange={(event) => setCreateCategoryName(event.target.value)}
                  placeholder="Ex: Picolé Tradicional"
                  className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600">Ordem</label>
                <input
                  type="number"
                  min={0}
                  value={createCategorySortOrder}
                  onChange={(event) => setCreateCategorySortOrder(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createCategoryActive}
                  onChange={(event) => setCreateCategoryActive(event.target.checked)}
                />
                Categoria ativa
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateCategoryModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                disabled={creatingCategory}
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleCreateCategory()}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={creatingCategory}
              >
                {creatingCategory ? 'Salvando...' : 'Salvar categoria'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDeleteCategoryModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-lg font-semibold text-rose-700">Apagar categoria</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-600">Categoria</label>
                <select
                  value={deleteCategoryId}
                  onChange={(event) => setDeleteCategoryId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-brand-100 px-3 py-2 text-sm bg-white"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={String(category.id)}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {selectedDeleteCategoryProductsCount > 0
                  ? `Esta categoria possui ${selectedDeleteCategoryProductsCount} produto(s) vinculado(s). Remova ou mova esses produtos antes de excluir.`
                  : 'Essa categoria nao possui produtos vinculados e pode ser excluida com seguranca.'}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteCategoryModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                disabled={deletingCategory}
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleDeleteCategory()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={deletingCategory || selectedDeleteCategoryProductsCount > 0}
              >
                {deletingCategory ? 'Excluindo...' : 'Excluir categoria'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default Produtos
