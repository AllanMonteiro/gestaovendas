import React, { useCallback, useMemo, useState } from 'react'
import { useCategories } from '../features/catalog/hooks/useCategories'
import {
  useCreateCategoryMutation,
  useCreateProductMutation,
  useDeleteCategoryMutation,
  useToggleProductActiveMutation,
  useUpdateProductMutation,
  useUpdateProductPriceMutation,
} from '../features/catalog/hooks/useCatalogMutations'
import { useProducts } from '../features/catalog/hooks/useProducts'
import { useProductPrices } from '../features/catalog/hooks/useProductPrices'
import type { Category, Product, ProductPrice } from '../features/catalog/types'
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  FilterBar,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  SectionHeader,
  Select,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableElement,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../components/ui'

const buildFallbackPrice = (product: Product, categoryList: Category[]): ProductPrice => ({
  price: String(categoryList.find((category) => category.id === product.category)?.price || '0'),
  cost: '0',
  freight: '0',
  other: '0',
  tax_pct: '0',
  overhead_pct: '0',
  margin_pct: '0',
  ideal_price: '0',
  profit: '0'
})

const buildFallbackPriceMap = (productList: Product[], categoryList: Category[]) =>
  Object.fromEntries(productList.map((product) => [product.id, buildFallbackPrice(product, categoryList)]))

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
  const productsQuery = useProducts()
  const categoriesQuery = useCategories()
  const createCategoryMutation = useCreateCategoryMutation()
  const deleteCategoryMutation = useDeleteCategoryMutation()
  const createProductMutation = useCreateProductMutation()
  const toggleProductActiveMutation = useToggleProductActiveMutation()
  const updateProductMutation = useUpdateProductMutation()
  const updateProductPriceMutation = useUpdateProductPriceMutation()
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
  const [deleteCategoryId, setDeleteCategoryId] = useState('')
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
  const products = productsQuery.data ?? []
  const categories = categoriesQuery.data ?? []
  const creatingCategory = createCategoryMutation.isPending
  const deletingCategory = deleteCategoryMutation.isPending
  const creatingProduct = createProductMutation.isPending
  const savingEdit = updateProductMutation.isPending
  const productIds = useMemo(
    () => products.map((product) => product.id),
    [products]
  )
  const productPricesQuery = useProductPrices(productIds, {
    enabled: productsQuery.isSuccess,
  })

  const priceMap = useMemo(() => {
    const fallbackMap = buildFallbackPriceMap(products, categories)
    const productIdSet = new Set(productIds)
    const fetchedPrices = productPricesQuery.data ?? []
    const mappedPrices = Object.fromEntries(
      fetchedPrices
        .filter((price) => typeof price.product === 'number' && productIdSet.has(Number(price.product)))
        .map((price) => [Number(price.product), price])
    )
    return { ...fallbackMap, ...mappedPrices }
  }, [categories, productIds, productPricesQuery.data, products])

  const auxiliaryFeedback = useMemo(() => {
    if (categoriesQuery.isError) {
      return 'Falha ao carregar categorias.'
    }
    if (productPricesQuery.isError) {
      return 'Falha ao carregar precos auxiliares.'
    }
    return ''
  }, [categoriesQuery.isError, productPricesQuery.isError])

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

  const activeProductsCount = useMemo(
    () => products.filter((product) => product.active).length,
    [products]
  )

  const soldByWeightCount = useMemo(
    () => products.filter((product) => product.sold_by_weight).length,
    [products]
  )

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

  const handleRefresh = async () => {
    setFeedback('')
    await Promise.all([
      productsQuery.refetch(),
      categoriesQuery.refetch(),
      productPricesQuery.refetch(),
    ])
  }

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
    if (categoriesQuery.isLoading) {
      setFeedback('Aguarde o carregamento das categorias.')
      return
    }
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
    if (categoriesQuery.isLoading) {
      setFeedback('Aguarde o carregamento das categorias.')
      return
    }
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

    try {
      const nextCategory = await createCategoryMutation.mutateAsync({
        name: createCategoryName.trim(),
        sort_order: sortOrder,
        active: createCategoryActive
      })
      setFeedback('Categoria criada com sucesso.')
      setShowCreateCategoryModal(false)
      if (!createCategory) {
        setCreateCategory(String(nextCategory.id))
      }
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao criar categoria.'))
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

    try {
      await deleteCategoryMutation.mutateAsync(Number(deleteCategoryId))
      setFeedback('Categoria excluida com sucesso.')
      setShowDeleteCategoryModal(false)
      setDeleteCategoryId('')
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao excluir categoria.'))
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

    try {
      await createProductMutation.mutateAsync({
        category: categoryId,
        name: createName.trim(),
        active: createActive,
        sold_by_weight: createSoldByWeight,
        stock: toDecimal(createStock || '0'),
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
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao criar produto.'))
    }
  }

  const handleSetPrice = async (product: Product) => {
    const currentPrice = priceMap[product.id]?.price || '0'
    const priceInput = window.prompt(`Novo preco para ${product.name}:`, String(currentPrice))
    if (!priceInput) {
      return
    }

    try {
      await updateProductPriceMutation.mutateAsync({
        productId: product.id,
        price: priceInput.replace(',', '.'),
        cost: priceMap[product.id]?.cost || '0'
      })
      setFeedback('Preco atualizado.')
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao atualizar preco.'))
    }
  }

  const handleApplyIdealPrice = async (product: Product) => {
    const info = priceMap[product.id]
    if (!info) {
      setFeedback('Preco ideal indisponivel para este produto.')
      return
    }
    try {
      await updateProductPriceMutation.mutateAsync({
        productId: product.id,
        price: info.ideal_price,
        cost: info.cost
      })
      setFeedback('Preco ideal aplicado.')
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao aplicar preco ideal.'))
    }
  }

  const handleToggleActive = async (product: Product) => {
    try {
      await toggleProductActiveMutation.mutateAsync({ product })
      setFeedback('Status do produto atualizado.')
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao alterar status do produto.'))
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

    try {
      await updateProductMutation.mutateAsync({
        id: editingProduct.id,
        category: categoryId,
        name: editName.trim(),
        active: editingProduct.active,
        sold_by_weight: editSoldByWeight,
        stock: toDecimal(editStock || '0'),
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
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao atualizar produto.'))
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
      <PageHeader
        eyebrow="Catalogo"
        title="Produtos"
        description="Gerencie itens, categorias e precificacao com uma hierarquia visual mais clara, sem mudar o comportamento atual."
        meta={<Badge variant="brand">{filteredProducts.length} produto(s)</Badge>}
        actions={
          <>
            <Button variant="secondary" onClick={() => void handleRefresh()}>
              {productsQuery.isFetching ? 'Atualizando...' : 'Atualizar'}
            </Button>
            <Button variant="ghost" onClick={openCreateCategoryModal}>Nova categoria</Button>
            <Button variant="danger" onClick={openDeleteCategoryModal}>Excluir categoria</Button>
            <Button variant="primary" onClick={() => openCreateProductModal()}>Novo produto</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Itens visiveis" value={filteredProducts.length} description="Resultado atual da busca." tone="accent" />
        <StatCard label="Produtos ativos" value={activeProductsCount} description="Disponiveis para venda." />
        <StatCard label="Venda por peso" value={soldByWeightCount} description="Itens configurados por kg." />
      </div>

      <FilterBar
        title="Busca e filtros"
        description="Pesquise por produto ou categoria e mantenha as acoes principais sempre acessiveis."
        actions={searchTerm ? <Badge variant="info">Filtro ativo</Badge> : <Badge variant="neutral">Lista completa</Badge>}
      >
        <Input
          label="Pesquisar produto"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Pesquisar produto ou categoria"
          className="lg:max-w-md"
        />
        {searchTerm ? <Button variant="secondary" onClick={() => setSearchTerm('')}>Limpar busca</Button> : null}
      </FilterBar>

      {feedback || auxiliaryFeedback ? (
        <Card className="p-4" tone={feedback ? 'warning' : 'muted'}>
          <p className="text-sm font-medium text-slate-700">{feedback || auxiliaryFeedback}</p>
        </Card>
      ) : null}

      <Card className="p-0">
        <div className="border-b border-[color:var(--line)] px-4 py-4 sm:px-5">
          <SectionHeader
            title="Itens cadastrados"
            description="Visualize estoque, preco atual, preco ideal e acoes operacionais em uma tabela mais consistente."
            meta={<Badge variant="neutral">{categories.length} categoria(s)</Badge>}
          />
        </div>
        <Table>
          <TableElement>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Produto</TableHeaderCell>
                <TableHeaderCell>Categoria</TableHeaderCell>
                <TableHeaderCell className="text-right">Estoque</TableHeaderCell>
                <TableHeaderCell>Preco</TableHeaderCell>
                <TableHeaderCell>Ideal</TableHeaderCell>
                <TableHeaderCell>Lucro</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Acoes</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {productsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <LoadingState title="Carregando produtos" description="Buscando categorias, estoque e precificacao." />
                  </TableCell>
                </TableRow>
              ) : productsQuery.isError ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-rose-700">
                    Falha ao carregar produtos.
                  </TableCell>
                </TableRow>
              ) : filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState
                      title="Nenhum produto encontrado"
                      description="Ajuste a pesquisa ou cadastre um novo item para preencher o catalogo."
                      action={<Button variant="primary" onClick={() => openCreateProductModal()}>Novo produto</Button>}
                    />
                  </TableCell>
                </TableRow>
              ) : filteredProducts.map((product) => {
                const pricing = priceMap[product.id]
                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-900">{product.name}</div>
                        {product.sold_by_weight ? <Badge variant="info">Vendido por kg</Badge> : <Badge variant="neutral">Unidade</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{categoryById.get(product.category) || product.category}</TableCell>
                    <TableCell className="text-right font-medium">{String(product.stock || '0')}</TableCell>
                    <TableCell className="font-semibold text-slate-900">{formatBRL(pricing?.price || '0')}</TableCell>
                    <TableCell>{formatBRL(pricing?.ideal_price || '0')}</TableCell>
                    <TableCell>{formatBRL(pricing?.profit || '0')}</TableCell>
                    <TableCell>
                      <Badge variant={product.active ? 'success' : 'warning'}>
                        {product.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => void handleSetPrice(product)}>Preco</Button>
                        <Button size="sm" variant="ghost" onClick={() => openEditProduct(product)}>Editar</Button>
                        <Button size="sm" variant="success" onClick={() => void handleApplyIdealPrice(product)}>Aplicar ideal</Button>
                        <Button size="sm" variant={product.active ? 'warning' : 'secondary'} onClick={() => void handleToggleActive(product)}>
                          {product.active ? 'Inativar' : 'Ativar'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </TableElement>
        </Table>
      </Card>

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
            <h3 className="text-lg font-semibold text-rose-700">Excluir categoria</h3>

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
