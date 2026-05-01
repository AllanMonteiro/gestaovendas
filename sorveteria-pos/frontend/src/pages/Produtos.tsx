import React, { useCallback, useMemo, useState } from 'react'
import { useCategories } from '../features/catalog/hooks/useCategories'
import {
  useCreateCategoryMutation,
  useCreateProductMutation,
  useCreateProductStockEntryMutation,
  useDeleteProductStockEntryMutation,
  useDeleteCategoryMutation,
  useToggleProductActiveMutation,
  useUpdateProductStockEntryMutation,
  useUpdateProductMutation,
  useUpdateProductPriceMutation,
} from '../features/catalog/hooks/useCatalogMutations'
import { useProducts } from '../features/catalog/hooks/useProducts'
import { useProductPrices } from '../features/catalog/hooks/useProductPrices'
import { useProductStockEntries } from '../features/catalog/hooks/useProductStockEntries'
import type { Category, Product, ProductPrice, ProductStockEntry } from '../features/catalog/types'
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CheckboxField,
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
const formatQty = (value: string | number) =>
  Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
const todayIso = () => new Date().toISOString().slice(0, 10)
const toDecimal = (value: string) => value.replace(',', '.').trim()
const toNumber = (value: string) => Number(toDecimal(value) || '0')
const formatInputBRL = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

type ProductFormValues = {
  category: string
  name: string
  stock: string
  cost: string
  freight: string
  other: string
  taxPct: string
  overheadPct: string
  price: string
  marginPct: string
  soldByWeight: boolean
  active?: boolean
}

type ProductFormFieldsProps = {
  categories: Category[]
  values: ProductFormValues
  onCategoryChange: (value: string) => void
  onNameChange: (value: string) => void
  onStockChange: (value: string) => void
  onCostChange: (value: string) => void
  onFreightChange: (value: string) => void
  onOtherChange: (value: string) => void
  onTaxPctChange: (value: string) => void
  onOverheadPctChange: (value: string) => void
  onPriceChange: (value: string) => void
  onMarginPctChange: (value: string) => void
  onSoldByWeightChange: (checked: boolean) => void
  onActiveChange?: (checked: boolean) => void
  onCategoryDefaults?: (categoryId: number) => void
}

type CategoryFormFieldsProps = {
  name: string
  onNameChange: (value: string) => void
  sortOrder: string
  onSortOrderChange: (value: string) => void
  active: boolean
  onActiveChange: (checked: boolean) => void
}

const ProductFinancialSummary: React.FC<{
  cost: string
  freight: string
  other: string
  price: string
}> = ({ cost, freight, other, price }) => (
  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm">
    <span>Custo total: {formatBRL(toNumber(cost) + toNumber(freight) + toNumber(other))}</span>
    <span>Lucro estimado: {formatBRL(toNumber(price) - (toNumber(cost) + toNumber(freight) + toNumber(other)))}</span>
  </div>
)

const ProductFormFields: React.FC<ProductFormFieldsProps> = ({
  categories,
  values,
  onCategoryChange,
  onNameChange,
  onStockChange,
  onCostChange,
  onFreightChange,
  onOtherChange,
  onTaxPctChange,
  onOverheadPctChange,
  onPriceChange,
  onMarginPctChange,
  onSoldByWeightChange,
  onActiveChange,
  onCategoryDefaults,
}) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
    <Select
      label="Categoria"
      value={values.category}
      onChange={(event) => {
        const nextValue = event.target.value
        onCategoryChange(nextValue)
        if (nextValue && onCategoryDefaults) {
          onCategoryDefaults(Number(nextValue))
        }
      }}
      className="bg-white"
    >
      {categories.map((category) => (
        <option key={category.id} value={String(category.id)}>
          {category.name}
        </option>
      ))}
    </Select>
    <Input
      label="Produto"
      value={values.name}
      onChange={(event) => onNameChange(event.target.value)}
      placeholder="Nome do produto"
      className="md:col-span-2"
    />
    <Input
      label="Estoque Atual"
      value={values.stock}
      onChange={(event) => onStockChange(event.target.value)}
    />
    <Input
      label="Custo"
      value={values.cost}
      onChange={(event) => onCostChange(event.target.value)}
    />
    <Input
      label="Frete"
      value={values.freight}
      onChange={(event) => onFreightChange(event.target.value)}
    />
    <Input
      label="Outros"
      value={values.other}
      onChange={(event) => onOtherChange(event.target.value)}
    />
    <Input
      label="Imposto %"
      value={values.taxPct}
      onChange={(event) => onTaxPctChange(event.target.value)}
    />
    <Input
      label="Func/Admin %"
      value={values.overheadPct}
      onChange={(event) => onOverheadPctChange(event.target.value)}
    />
    <Input
      label="Venda atual"
      value={values.price}
      onChange={(event) => onPriceChange(event.target.value)}
    />
    <Input
      label="Margem desejada %"
      value={values.marginPct}
      onChange={(event) => onMarginPctChange(event.target.value)}
    />
    <div className="flex items-end">
      <CheckboxField
        label="Vendido por kg"
        checked={values.soldByWeight}
        onChange={(event) => onSoldByWeightChange(event.target.checked)}
      />
    </div>
    {typeof values.active === 'boolean' && onActiveChange ? (
      <div className="flex items-end">
        <CheckboxField
          label="Ativo"
          checked={values.active}
          onChange={(event) => onActiveChange(event.target.checked)}
        />
      </div>
    ) : null}
  </div>
)

const CategoryFormFields: React.FC<CategoryFormFieldsProps> = ({
  name,
  onNameChange,
  sortOrder,
  onSortOrderChange,
  active,
  onActiveChange,
}) => (
  <div className="space-y-3">
    <Input
      label="Nome da categoria"
      value={name}
      onChange={(event) => onNameChange(event.target.value)}
      placeholder="Ex: Picole Tradicional"
    />
    <Input
      label="Ordem"
      type="number"
      min={0}
      value={sortOrder}
      onChange={(event) => onSortOrderChange(event.target.value)}
    />
    <CheckboxField
      label="Categoria ativa"
      checked={active}
      onChange={(event) => onActiveChange(event.target.checked)}
    />
  </div>
)

const Produtos: React.FC = () => {
  const productsQuery = useProducts()
  const categoriesQuery = useCategories()
  const createCategoryMutation = useCreateCategoryMutation()
  const deleteCategoryMutation = useDeleteCategoryMutation()
  const createProductMutation = useCreateProductMutation()
  const createProductStockEntryMutation = useCreateProductStockEntryMutation()
  const updateProductStockEntryMutation = useUpdateProductStockEntryMutation()
  const deleteProductStockEntryMutation = useDeleteProductStockEntryMutation()
  const toggleProductActiveMutation = useToggleProductActiveMutation()
  const updateProductMutation = useUpdateProductMutation()
  const updateProductPriceMutation = useUpdateProductPriceMutation()
  const [feedback, setFeedback] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false)
  const [showDeleteCategoryModal, setShowDeleteCategoryModal] = useState(false)
  const [stockEntryProduct, setStockEntryProduct] = useState<Product | null>(null)
  const [editingStockEntry, setEditingStockEntry] = useState<ProductStockEntry | null>(null)
  const [stockEntryArrivalDate, setStockEntryArrivalDate] = useState(todayIso())
  const [stockEntryQuantity, setStockEntryQuantity] = useState('0,000')
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
  const creatingStockEntry = createProductStockEntryMutation.isPending
  const updatingStockEntry = updateProductStockEntryMutation.isPending
  const deletingStockEntry = deleteProductStockEntryMutation.isPending
  const savingEdit = updateProductMutation.isPending
  const productIds = useMemo(
    () => products.map((product) => product.id),
    [products]
  )
  const productPricesQuery = useProductPrices(productIds, {
    enabled: productsQuery.isSuccess,
  })
  const stockEntriesQuery = useProductStockEntries(stockEntryProduct?.id ?? null, {
    enabled: stockEntryProduct !== null,
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
    if (stockEntriesQuery.isError && stockEntryProduct) {
      return 'Falha ao carregar entradas de estoque.'
    }
    return ''
  }, [categoriesQuery.isError, productPricesQuery.isError, stockEntriesQuery.isError, stockEntryProduct])

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
      stockEntryProduct ? stockEntriesQuery.refetch() : Promise.resolve(),
    ])
  }

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

  const openStockEntryModal = (product: Product) => {
    setStockEntryProduct(product)
    setEditingStockEntry(null)
    setStockEntryArrivalDate(todayIso())
    setStockEntryQuantity('0,000')
    setFeedback('')
  }

  const closeStockEntryModal = () => {
    setStockEntryProduct(null)
    setEditingStockEntry(null)
    setStockEntryArrivalDate(todayIso())
    setStockEntryQuantity('0,000')
  }

  const startEditingStockEntry = (entry: ProductStockEntry) => {
    setEditingStockEntry(entry)
    setStockEntryArrivalDate(entry.arrival_date)
    setStockEntryQuantity(String(entry.quantity).replace('.', ','))
    setFeedback('')
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

  const handleCreateStockEntry = async () => {
    if (!stockEntryProduct) {
      return
    }
    if (!stockEntryArrivalDate) {
      setFeedback('Informe a data de chegada do estoque.')
      return
    }

    const quantity = toDecimal(stockEntryQuantity || '0')
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      setFeedback('Informe uma quantidade valida maior que zero.')
      return
    }

    try {
      if (editingStockEntry) {
        await updateProductStockEntryMutation.mutateAsync({
          productId: stockEntryProduct.id,
          entryId: editingStockEntry.id,
          arrival_date: stockEntryArrivalDate,
          quantity,
        })
        setFeedback('Entrada de estoque atualizada com sucesso.')
      } else {
        await createProductStockEntryMutation.mutateAsync({
          productId: stockEntryProduct.id,
          arrival_date: stockEntryArrivalDate,
          quantity,
        })
        setFeedback('Entrada de estoque registrada com sucesso.')
      }
      closeStockEntryModal()
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, editingStockEntry ? 'Falha ao atualizar entrada de estoque.' : 'Falha ao registrar entrada de estoque.'))
    }
  }

  const handleDeleteStockEntry = async (entry: ProductStockEntry) => {
    if (!stockEntryProduct) {
      return
    }
    const confirmed = window.confirm(`Excluir a entrada de ${formatQty(entry.quantity)} registrada em ${new Date(`${entry.arrival_date}T00:00:00`).toLocaleDateString('pt-BR')}?`)
    if (!confirmed) {
      return
    }

    try {
      await deleteProductStockEntryMutation.mutateAsync({ productId: stockEntryProduct.id, entryId: entry.id })
      setFeedback('Entrada de estoque excluida com sucesso.')
      if (editingStockEntry?.id === entry.id) {
        setEditingStockEntry(null)
        setStockEntryArrivalDate(todayIso())
        setStockEntryQuantity('0,000')
      }
    } catch (error: unknown) {
      setFeedback(getApiErrorText(error, 'Falha ao excluir entrada de estoque.'))
    }
  }

  return (
    <div className="ui-screen">
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
                        <Button size="sm" variant="success" onClick={() => openStockEntryModal(product)}>Entrada</Button>
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

      <Modal
        open={editingProduct !== null}
        onClose={savingEdit ? undefined : () => setEditingProduct(null)}
        title="Editar produto"
        description={editingProduct ? `Atualize estoque, custos e venda de ${editingProduct.name}.` : undefined}
        size="xl"
        footer={
          <>
            <Button onClick={handleApplyIdealPriceOnEdit} variant="ghost" className="sm:mr-auto">
              Aplicar preco ideal
            </Button>
            <Button onClick={() => setEditingProduct(null)} variant="secondary" disabled={savingEdit}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSaveEditProduct()} variant="primary" disabled={savingEdit}>
              {savingEdit ? 'Salvando...' : 'Salvar'}
            </Button>
          </>
        }
      >
        {editingProduct ? (
          <div className="space-y-4">
            <ProductFormFields
              categories={categories}
              values={{
                category: editCategory,
                name: editName,
                stock: editStock,
                cost: editCost,
                freight: editFreight,
                other: editOther,
                taxPct: editTaxPct,
                overheadPct: editOverheadPct,
                price: editPrice,
                marginPct: editMarginPct,
                soldByWeight: editSoldByWeight,
              }}
              onCategoryChange={setEditCategory}
              onNameChange={setEditName}
              onStockChange={setEditStock}
              onCostChange={setEditCost}
              onFreightChange={setEditFreight}
              onOtherChange={setEditOther}
              onTaxPctChange={setEditTaxPct}
              onOverheadPctChange={setEditOverheadPct}
              onPriceChange={setEditPrice}
              onMarginPctChange={setEditMarginPct}
              onSoldByWeightChange={setEditSoldByWeight}
            />
            <ProductFinancialSummary
              cost={editCost}
              freight={editFreight}
              other={editOther}
              price={editPrice}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={stockEntryProduct !== null}
        onClose={creatingStockEntry || updatingStockEntry || deletingStockEntry ? undefined : closeStockEntryModal}
        title={editingStockEntry ? 'Editar entrada de estoque' : 'Cadastrar entrada de estoque'}
        description={stockEntryProduct ? `Registre a chegada de estoque para ${stockEntryProduct.name}.` : undefined}
        size="lg"
        footer={
          <>
            {editingStockEntry ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditingStockEntry(null)
                  setStockEntryArrivalDate(todayIso())
                  setStockEntryQuantity('0,000')
                }}
                disabled={creatingStockEntry || updatingStockEntry || deletingStockEntry}
              >
                Nova entrada
              </Button>
            ) : null}
            <Button variant="secondary" onClick={closeStockEntryModal} disabled={creatingStockEntry || updatingStockEntry || deletingStockEntry}>Cancelar</Button>
            <Button variant="primary" onClick={() => void handleCreateStockEntry()} disabled={creatingStockEntry || updatingStockEntry || deletingStockEntry}>
              {creatingStockEntry || updatingStockEntry ? 'Salvando...' : editingStockEntry ? 'Salvar alteracoes' : 'Salvar entrada'}
            </Button>
          </>
        }
      >
        {stockEntryProduct ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <StatCard
                label="Produto"
                value={stockEntryProduct.name}
                description={categoryById.get(stockEntryProduct.category) || 'Sem categoria'}
              />
              <StatCard
                label="Estoque atual"
                value={formatQty(stockEntryProduct.stock)}
                description="Quantidade disponivel antes desta entrada"
                tone="accent"
              />
              <StatCard
                label="Ultimas entradas"
                value={String(stockEntriesQuery.data?.length ?? 0)}
                description="Registros encontrados para este item"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Input
                label="Data de chegada"
                type="date"
                value={stockEntryArrivalDate}
                onChange={(event) => setStockEntryArrivalDate(event.target.value)}
              />
              <Input
                label="Quantidade"
                value={stockEntryQuantity}
                onChange={(event) => setStockEntryQuantity(event.target.value)}
                placeholder="0,000"
              />
            </div>

            <div className="space-y-3">
              <SectionHeader
                title="Historico recente"
                description="As entradas abaixo ajudam a conferir reposicoes recentes do produto."
              />
              <Table>
                <TableElement>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Data de chegada</TableHeaderCell>
                      <TableHeaderCell>Quantidade</TableHeaderCell>
                      <TableHeaderCell>Criado em</TableHeaderCell>
                      <TableHeaderCell>Acoes</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stockEntriesQuery.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={4}>Carregando entradas...</TableCell>
                      </TableRow>
                    ) : (stockEntriesQuery.data ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4}>Nenhuma entrada registrada para este produto.</TableCell>
                      </TableRow>
                    ) : (
                      (stockEntriesQuery.data ?? []).slice(0, 8).map((entry: ProductStockEntry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{new Date(`${entry.arrival_date}T00:00:00`).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell>{formatQty(entry.quantity)}</TableCell>
                          <TableCell>{new Date(entry.created_at).toLocaleString('pt-BR')}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEditingStockEntry(entry)}
                                disabled={creatingStockEntry || updatingStockEntry || deletingStockEntry}
                              >
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => void handleDeleteStockEntry(entry)}
                                disabled={creatingStockEntry || updatingStockEntry || deletingStockEntry}
                              >
                                Excluir
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </TableElement>
              </Table>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={showCreateModal}
        onClose={creatingProduct ? undefined : () => setShowCreateModal(false)}
        title="Cadastrar produto"
        description="Preencha os dados principais para incluir um novo item no catalogo."
        size="xl"
        footer={
          <>
            <Button onClick={handleApplyIdealPriceOnCreate} variant="ghost" className="sm:mr-auto">
              Aplicar preco ideal
            </Button>
            <Button onClick={() => setShowCreateModal(false)} variant="secondary" disabled={creatingProduct}>
              Cancelar
            </Button>
            <Button onClick={() => void handleCreateProduct()} variant="primary" disabled={creatingProduct}>
              {creatingProduct ? 'Salvando...' : 'Salvar produto'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <ProductFormFields
            categories={categories}
            values={{
              category: createCategory,
              name: createName,
              stock: createStock,
              cost: createCost,
              freight: createFreight,
              other: createOther,
              taxPct: createTaxPct,
              overheadPct: createOverheadPct,
              price: createPrice,
              marginPct: createMarginPct,
              soldByWeight: createSoldByWeight,
              active: createActive,
            }}
            onCategoryChange={setCreateCategory}
            onNameChange={setCreateName}
            onStockChange={setCreateStock}
            onCostChange={setCreateCost}
            onFreightChange={setCreateFreight}
            onOtherChange={setCreateOther}
            onTaxPctChange={setCreateTaxPct}
            onOverheadPctChange={setCreateOverheadPct}
            onPriceChange={setCreatePrice}
            onMarginPctChange={setCreateMarginPct}
            onSoldByWeightChange={setCreateSoldByWeight}
            onActiveChange={setCreateActive}
            onCategoryDefaults={applyCategoryDefaults}
          />
          <ProductFinancialSummary
            cost={createCost}
            freight={createFreight}
            other={createOther}
            price={createPrice}
          />
        </div>
      </Modal>

      <Modal
        open={showCreateCategoryModal}
        onClose={creatingCategory ? undefined : () => setShowCreateCategoryModal(false)}
        title="Cadastrar categoria"
        description="Crie uma categoria para organizar o catalogo e aplicar configuracoes padrao."
        size="md"
        footer={
          <>
            <Button onClick={() => setShowCreateCategoryModal(false)} variant="secondary" disabled={creatingCategory}>
              Cancelar
            </Button>
            <Button onClick={() => void handleCreateCategory()} variant="primary" disabled={creatingCategory}>
              {creatingCategory ? 'Salvando...' : 'Salvar categoria'}
            </Button>
          </>
        }
      >
        <CategoryFormFields
          name={createCategoryName}
          onNameChange={setCreateCategoryName}
          sortOrder={createCategorySortOrder}
          onSortOrderChange={setCreateCategorySortOrder}
          active={createCategoryActive}
          onActiveChange={setCreateCategoryActive}
        />
      </Modal>

      <Modal
        open={showDeleteCategoryModal}
        onClose={deletingCategory ? undefined : () => setShowDeleteCategoryModal(false)}
        title="Excluir categoria"
        description="Confirme a categoria que deseja remover do catalogo."
        size="md"
        footer={
          <>
            <Button onClick={() => setShowDeleteCategoryModal(false)} variant="secondary" disabled={deletingCategory}>
              Cancelar
            </Button>
            <Button onClick={() => void handleDeleteCategory()} variant="danger" disabled={deletingCategory || selectedDeleteCategoryProductsCount > 0}>
              {deletingCategory ? 'Excluindo...' : 'Excluir categoria'}
            </Button>
          </>
        }
      >

        <div className="space-y-3">
          <Select
            label="Categoria"
            value={deleteCategoryId}
            onChange={(event) => setDeleteCategoryId(event.target.value)}
            className="bg-white"
          >
            {categories.map((category) => (
              <option key={category.id} value={String(category.id)}>
                {category.name}
              </option>
            ))}
          </Select>

          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {selectedDeleteCategoryProductsCount > 0
              ? `Esta categoria possui ${selectedDeleteCategoryProductsCount} produto(s) vinculado(s). Remova ou mova esses produtos antes de excluir.`
              : 'Essa categoria nao possui produtos vinculados e pode ser excluida com seguranca.'}
          </div>
        </div>

      </Modal>
    </div>
  )
}

export default Produtos
