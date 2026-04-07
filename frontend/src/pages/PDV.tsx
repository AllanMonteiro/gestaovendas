import React, { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import { openThermalReceiptPdf, type ThermalReceiptPayload } from '../app/thermalReceipt'
import { OpenOrdersPanel } from '../components/OpenOrdersPanel'
import { ProductGrid } from '../components/ProductGrid'
import { OrderPanel } from '../components/OrderPanel'
import { ScaleProductModal } from '../components/ScaleProductModal'
import { PaymentModal, type PaymentEntry, type PaymentMethod } from '../components/PaymentModal'
import { getCategories, getProducts, getConfig, saveCategories, saveProducts, saveConfig } from '../offline/catalog'
import type { OutboxItem } from '../offline/db'
import { getLocalOrder, listLocalOrders, removeLocalOrder, saveLocalOrder, syncLocalOpenOrders } from '../offline/localOrders'
import { enqueueOutbox, listOutbox, removeOutboxEntries } from '../offline/outbox'
import { connectWS } from '../api/ws'

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

type OrderItem = {
  id: number
  product: number
  qty: string | number
  total: string | number
  unit_price?: string | number
  product_name?: string
  client_request_id?: string | null
  weight_grams?: number | null
  notes?: string | null
}

type Order = {
  id: string
  display_number?: string
  status: string
  total: string
  subtotal: string
  discount: string
  client_request_id?: string | null
  local_only?: boolean
  customer?: number | null
  customer_name?: string | null
  customer_phone?: string | null
  items: OrderItem[]
}

type OrderSummary = Omit<Order, 'items'> & {
  items?: OrderItem[]
}

type CustomerLookupResponse = {
  customer: {
    id: number
    name?: string | null
    phone: string
  }
  account?: {
    id: number
    points_balance: number
  }
}

type Feedback = {
  type: 'ok' | 'error'
  text: string
}

type StoreConfigResponse = {
  store_name?: string
  company_name?: string | null
  cnpj?: string | null
  address?: string | null
  category_images?: Record<string, string>
  point_value_real?: string | number
  min_redeem_points?: number
  receipt_header_lines?: string[]
  receipt_footer_lines?: string[]
  printer?: {
    provider?: string
    agent_url?: string
    printer_name?: string
    width_mm?: number
    auto_print_receipt?: boolean
    auto_print_kitchen?: boolean
  }
}

type CashStatusResponse = {
  open: boolean
}

const PDV_REFRESH_DEBOUNCE_MS = 150

const formatBRL = (value: string | number) => {
  const numberValue = Number(value || 0)
  return numberValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const round3 = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000
const moneyString = (value: number) => round2(value).toFixed(2)

const receiptPaymentLabel = (method: string, meta?: Record<string, string> | null) => {
  if (method === 'CARD') {
    if (meta?.card_type === 'CREDIT') return 'Cartao credito'
    if (meta?.card_type === 'DEBIT') return 'Cartao debito'
    return 'Cartao'
  }
  if (method === 'PIX') return 'PIX'
  return 'Dinheiro'
}

const parsePaymentMetaAmount = (meta: Record<string, string> | null | undefined, key: string) => {
  const value = Number(meta?.[key] ?? 0)
  return Number.isFinite(value) ? value : 0
}

const receiptPaymentNote = (payment: { amount: string; meta?: Record<string, string> | null }) => {
  const cashReceived = parsePaymentMetaAmount(payment.meta, 'cash_received')
  const changeAmount = parsePaymentMetaAmount(payment.meta, 'change_amount')
  const paymentAmount = Number(payment.amount || 0)

  if (cashReceived <= 0 || cashReceived <= paymentAmount) {
    return undefined
  }
  if (changeAmount > 0) {
    return `Recebido ${formatBRL(cashReceived)} | Troco ${formatBRL(changeAmount)}`
  }
  return `Recebido ${formatBRL(cashReceived)}`
}

const getOrderDisplayNumber = (order: Pick<Order, 'id' | 'display_number'>) => order.display_number || order.id.slice(0, 8)

const getHttpStatus = (error: unknown): number => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { status?: number } }).response?.status === 'number'
  ) {
    return (error as { response: { status: number } }).response.status
  }
  return 0
}

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

const isNetworkError = (error: unknown) =>
  Boolean(
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    !(error as { response?: unknown }).response
  )

const toOrderSummary = (order: Order | OrderSummary): OrderSummary => {
  const { items, ...summary } = order
  return summary
}

const mergeOrderSummary = (current: Order, summary: OrderSummary): Order => ({
  ...current,
  display_number: summary.display_number ?? current.display_number,
  status: summary.status ?? current.status,
  subtotal: String(summary.subtotal ?? current.subtotal),
  discount: String(summary.discount ?? current.discount),
  total: String(summary.total ?? current.total),
  client_request_id: summary.client_request_id ?? current.client_request_id ?? null,
  local_only: Boolean(summary.local_only),
  customer: summary.customer ?? current.customer ?? null,
  customer_name: summary.customer_name ?? current.customer_name ?? null,
  customer_phone: summary.customer_phone ?? current.customer_phone ?? null,
})

const normalizeOrder = (order: Partial<Order> & { id: string }): Order => ({
  id: order.id,
  display_number: order.display_number,
  status: order.status ?? 'OPEN',
  subtotal: String(order.subtotal ?? '0'),
  discount: String(order.discount ?? '0'),
  total: String(order.total ?? '0'),
  client_request_id: order.client_request_id ?? null,
  local_only: Boolean(order.local_only),
  customer: order.customer ?? null,
  customer_name: order.customer_name ?? null,
  customer_phone: order.customer_phone ?? null,
  items: Array.isArray(order.items) ? order.items : [],
})

const buildOpenOrdersSnapshot = (orders: OrderSummary[]) =>
  JSON.stringify(
    orders.map((order) => [
      order.id,
      order.display_number ?? '',
      order.status,
      order.total,
      order.subtotal,
      order.discount,
      order.client_request_id ?? '',
      order.local_only ? 1 : 0,
      order.customer ?? '',
      order.customer_name ?? '',
      order.customer_phone ?? '',
    ])
  )

const buildCatalogSnapshot = (
  categories: Category[],
  products: Product[],
  config: StoreConfigResponse | null | undefined
) =>
  JSON.stringify({
    categories: categories.map((category) => [category.id, category.name]),
    products: products.map((product) => [
      product.id,
      product.category,
      product.name,
      product.sold_by_weight ? 1 : 0,
      product.active === false ? 0 : 1,
    ]),
    config: {
      store_name: config?.store_name ?? '',
      company_name: config?.company_name ?? '',
      cnpj: config?.cnpj ?? '',
      address: config?.address ?? '',
      point_value_real: String(config?.point_value_real ?? ''),
      min_redeem_points: String(config?.min_redeem_points ?? ''),
      category_images: config?.category_images ?? {},
      receipt_header_lines: config?.receipt_header_lines ?? [],
      receipt_footer_lines: config?.receipt_footer_lines ?? [],
      printer: config?.printer ?? {},
    },
  })

const addItemToOrder = (order: Order, item: OrderItem): Order => ({
  ...order,
  items: [...order.items, item],
  subtotal: moneyString(Number(order.subtotal || 0) + Number(item.total || 0)),
  total: moneyString(Number(order.total || 0) + Number(item.total || 0)),
})

const updateItemInOrder = (order: Order, itemId: number, changes: { qty: number; notes?: string | null }) => {
  const items = order.items.map((item) => {
    if (item.id !== itemId) {
      return item
    }
    const currentQty = Number(item.qty) || 1
    const fallbackUnitPrice = Number(item.total || 0) / Math.max(currentQty, 1)
    const unitPrice = Number(item.unit_price ?? fallbackUnitPrice)
    const nextTotal = moneyString(unitPrice * changes.qty)
    return {
      ...item,
      qty: changes.qty,
      notes: changes.notes ?? null,
      total: nextTotal,
      unit_price: unitPrice,
    }
  })
  const nextSubtotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0)
  return {
    ...order,
    items,
    subtotal: moneyString(nextSubtotal),
    total: moneyString(nextSubtotal - Number(order.discount || 0)),
  }
}

const removeItemFromOrder = (order: Order, itemId: number) => {
  const items = order.items.filter((item) => item.id !== itemId)
  const nextSubtotal = items.reduce((sum, item) => sum + Number(item.total || 0), 0)
  return {
    ...order,
    items,
    subtotal: moneyString(nextSubtotal),
    total: moneyString(nextSubtotal - Number(order.discount || 0)),
  }
}

const buildPendingOrderKeys = (items: Array<{ url?: string; body?: { client_request_id?: string } | null }>) => {
  const keys = new Set<string>()
  items.forEach((item) => {
    if (item.url === '/api/orders' && item.body?.client_request_id) {
      keys.add(item.body.client_request_id)
      return
    }
    const match = item.url?.match(/^\/api\/orders\/([^/]+)/)
    if (match?.[1]) {
      keys.add(match[1])
    }
  })
  return keys
}

const isOrderLinkedToOutboxEntry = (order: Order, entry: { url: string; body?: { client_request_id?: string } | null }) => {
  if (entry.url === '/api/orders' && entry.body?.client_request_id && entry.body.client_request_id === order.client_request_id) {
    return true
  }
  return entry.url.startsWith(`/api/orders/${order.id}`)
}

const PDV: React.FC = () => {
  const [openOrders, setOpenOrders] = useState<OrderSummary[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({})
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [productSearchTerm, setProductSearchTerm] = useState('')

  const [showNewOrderModal, setShowNewOrderModal] = useState(false)
  const [newOrderStep, setNewOrderStep] = useState<'phone' | 'profile'>('phone')
  const [phone, setPhone] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [loadingCreateOrder, setLoadingCreateOrder] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [closingSale, setClosingSale] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [showQtyModal, setShowQtyModal] = useState(false)
  const [qtyProduct, setQtyProduct] = useState<Product | null>(null)
  const [qtyInput, setQtyInput] = useState('1')
  const [addingQtyItem, setAddingQtyItem] = useState(false)
  const [addingScaleItem, setAddingScaleItem] = useState(false)
  const [cashOpen, setCashOpen] = useState(false)
  const [loyaltyBalance, setLoyaltyBalance] = useState(0)
  const [pointsToRedeem, setPointsToRedeem] = useState('0')
  const [pointValueReal, setPointValueReal] = useState(0)
  const [minRedeemPoints, setMinRedeemPoints] = useState(0)
  const [agentUrl, setAgentUrl] = useState('')
  const [storeLabel, setStoreLabel] = useState('Sorveteria POS')
  const [companyName, setCompanyName] = useState('')
  const [storeCnpj, setStoreCnpj] = useState('')
  const [storeAddress, setStoreAddress] = useState('')
  const [receiptHeaderLines, setReceiptHeaderLines] = useState<string[]>([])
  const [receiptFooterLines, setReceiptFooterLines] = useState<string[]>([])
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(true)
  const [autoPrintKitchen, setAutoPrintKitchen] = useState(false)
  const [printerName, setPrinterName] = useState('auto')
  const [lastReceiptPayload, setLastReceiptPayload] = useState<ThermalReceiptPayload | null>(null)
  const [showScaleModal, setShowScaleModal] = useState(false)
  const [scaleProduct, setScaleProduct] = useState<Product | null>(null)
  const [isOnline, setIsOnline] = useState(window.navigator.onLine)
  const [outboxCount, setOutboxCount] = useState(0)
  const [outboxPreview, setOutboxPreview] = useState<OutboxItem[]>([])
  const [pendingSyncOrderKeys, setPendingSyncOrderKeys] = useState<Set<string>>(new Set())
  const deferredProductSearchTerm = useDeferredValue(productSearchTerm)
  const wsRefreshTimerRef = useRef<number | null>(null)
  const lastCashValidationAtRef = useRef(0)
  const addingQtyItemRef = useRef(false)
  const addingScaleItemRef = useRef(false)
  const selectedOrderIdRef = useRef<string | null>(null)
  const selectedOrderRef = useRef<Order | null>(null)
  const openOrdersRequestIdRef = useRef(0)
  const orderDetailRequestIdRef = useRef(0)
  const catalogRequestIdRef = useRef(0)
  const openOrdersSnapshotRef = useRef('')
  const catalogSnapshotRef = useRef('')

  const productsById = useMemo(() => {
    const map = new Map<number, Product>()
    products.forEach((product) => map.set(product.id, product))
    return map
  }, [products])

  const searchResultProducts = useMemo(() => {
    const normalizedSearch = deferredProductSearchTerm.trim().toLowerCase()
    if (!normalizedSearch) {
      return []
    }
    const searchableProducts =
      selectedCategoryId === null ? products : products.filter((product) => product.category === selectedCategoryId)
    return searchableProducts.filter((product) => product.name.toLowerCase().includes(normalizedSearch)).slice(0, 12)
  }, [deferredProductSearchTerm, products, selectedCategoryId])

  const visibleProducts = useMemo(() => {
    if (selectedCategoryId === null) {
      return products
    }
    return products.filter((product) => product.category === selectedCategoryId)
  }, [products, selectedCategoryId])

  const rawPointsRequested = useMemo(() => {
    const parsed = Number(pointsToRedeem.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0
    }
    return Math.floor(parsed)
  }, [pointsToRedeem])

  const maxPointsByTotal = useMemo(() => {
    const total = Number(selectedOrder?.total || 0)
    if (pointValueReal <= 0 || total <= 0) {
      return 0
    }
    return Math.floor(total / pointValueReal)
  }, [selectedOrder?.total, pointValueReal])

  const effectiveRedeemPoints = useMemo(() => {
    const limited = Math.min(rawPointsRequested, loyaltyBalance, maxPointsByTotal)
    return limited > 0 ? limited : 0
  }, [rawPointsRequested, loyaltyBalance, maxPointsByTotal])

  const pointsDiscount = useMemo(() => round2(effectiveRedeemPoints * pointValueReal), [effectiveRedeemPoints, pointValueReal])
  const payableTotal = useMemo(() => {
    const total = Number(selectedOrder?.total || 0)
    return round2(Math.max(total - pointsDiscount, 0))
  }, [selectedOrder?.total, pointsDiscount])
  const canOperateOrders = cashOpen || !isOnline
  const refreshOutboxState = useCallback(async () => {
    const items = await listOutbox()
    startTransition(() => {
      setOutboxCount(items.length)
      setOutboxPreview(items.slice(0, 8))
      setPendingSyncOrderKeys(buildPendingOrderKeys(items))
    })
  }, [])

  const isOrderPendingSync = useCallback(
    (order: Order | OrderSummary | null) => {
      if (!order) {
        return false
      }
      return Boolean(
        order.local_only ||
        pendingSyncOrderKeys.has(order.id) ||
        (order.client_request_id && pendingSyncOrderKeys.has(order.client_request_id))
      )
    },
    [pendingSyncOrderKeys]
  )

  useEffect(() => {
    selectedOrderIdRef.current = selectedOrderId
  }, [selectedOrderId])

  useEffect(() => {
    selectedOrderRef.current = selectedOrder
  }, [selectedOrder])

  const applyOpenOrders = useCallback((nextOrders: OrderSummary[]) => {
    const snapshot = buildOpenOrdersSnapshot(nextOrders)
    if (snapshot === openOrdersSnapshotRef.current) {
      return
    }
    openOrdersSnapshotRef.current = snapshot
    startTransition(() => {
      setOpenOrders(nextOrders)
    })
  }, [])

  const applyOrderSnapshot = useCallback((order: Order) => {
    selectedOrderRef.current = order
    selectedOrderIdRef.current = order.id
    startTransition(() => {
      setSelectedOrder(order)
      setSelectedOrderId(order.id)
      setOpenOrders((prev) => {
        const summary = toOrderSummary(order)
        const existingIndex = prev.findIndex((entry) => entry.id === order.id)
        if (existingIndex === -1) {
          const next = [summary, ...prev]
          openOrdersSnapshotRef.current = buildOpenOrdersSnapshot(next)
          return next
        }
        const next = [...prev]
        next[existingIndex] = { ...next[existingIndex], ...summary }
        openOrdersSnapshotRef.current = buildOpenOrdersSnapshot(next)
        return next
      })
    })
    void saveLocalOrder(order)
  }, [])

  const mergeSelectedOrderSummary = useCallback((summary: OrderSummary | null) => {
    if (!summary) {
      return
    }
    startTransition(() => {
      setSelectedOrder((prev) => {
        if (!prev || prev.id !== summary.id) {
          return prev
        }
        const next = mergeOrderSummary(prev, summary)
        selectedOrderRef.current = next
        return next
      })
    })
  }, [])

  const discardLocalOrder = useCallback(async (order: Order) => {
    await removeOutboxEntries((entry) => isOrderLinkedToOutboxEntry(order, entry))
    await removeLocalOrder(order.id)
    setOpenOrders((prev) => {
      const next = prev.filter((item) => item.id !== order.id)
      openOrdersSnapshotRef.current = buildOpenOrdersSnapshot(next)
      return next
    })
    setSelectedOrder((prev) => {
      const next = prev?.id === order.id ? null : prev
      selectedOrderRef.current = next
      return next
    })
    setSelectedOrderId((prev) => {
      const next = prev === order.id ? null : prev
      selectedOrderIdRef.current = next
      return next
    })
  }, [])

  const rebuildLocalOnlyOrderQueue = useCallback(async (order: Order) => {
    await removeOutboxEntries((entry) => entry.url.startsWith(`/api/orders/${order.id}/items`))
    for (const item of order.items) {
      await enqueueOutbox({
        method: 'POST',
        url: `/api/orders/${order.id}/items`,
        body: {
          product_id: item.product,
          qty: item.qty,
          weight_grams: item.weight_grams ?? undefined,
          notes: item.notes ?? undefined,
          client_request_id: item.client_request_id ?? undefined,
        },
        headers: {},
      })
    }
  }, [])

  const fetchOrderDetail = useCallback(async (orderId: string) => {
    const requestId = ++orderDetailRequestIdRef.current
    try {
      const response = await api.get<Order>(`/api/orders/${orderId}/detail`)
      if (requestId !== orderDetailRequestIdRef.current) {
        return null
      }
      const order = normalizeOrder(response.data)
      applyOrderSnapshot(order)
      setIsOnline(true)
      return order
    } catch (error) {
      const localOrder = await getLocalOrder<Order>(orderId)
      if (requestId !== orderDetailRequestIdRef.current) {
        return null
      }
      if (localOrder) {
        const normalizedLocalOrder = normalizeOrder(localOrder)
        applyOrderSnapshot(normalizedLocalOrder)
        return normalizedLocalOrder
      }
      if (isNetworkError(error)) {
        setIsOnline(false)
      }
      return null
    }
  }, [applyOrderSnapshot])

  const fetchCatalog = useCallback(async () => {
    const requestId = ++catalogRequestIdRef.current
    try {
      const [categoriesResp, productsResp, configResp] = await Promise.all([
        api.get<Category[]>('/api/categories'),
        api.get<Product[]>('/api/products?compact=1'),
        api.get<StoreConfigResponse>('/api/config/pdv')
      ])
      if (requestId !== catalogRequestIdRef.current) {
        return
      }
      
      const cats = categoriesResp.data
      const prods = productsResp.data.filter((item) => item.active !== false)
      const conf = configResp.data
      const snapshot = buildCatalogSnapshot(cats, prods, conf)

      if (snapshot !== catalogSnapshotRef.current) {
        catalogSnapshotRef.current = snapshot
        startTransition(() => {
          setCategories(cats)
          setProducts(prods)
          setCategoryImages(conf.category_images ?? {})
          setPointValueReal(Number(conf.point_value_real ?? 0))
          setMinRedeemPoints(Number(conf.min_redeem_points ?? 0))
          setAgentUrl(conf.printer?.agent_url?.trim() ?? '')
          setStoreLabel(conf.store_name || 'Sorveteria POS')
          setCompanyName(conf.company_name || '')
          setStoreCnpj(conf.cnpj || '')
          setStoreAddress(conf.address || '')
          setReceiptHeaderLines(conf.receipt_header_lines ?? [])
          setReceiptFooterLines(conf.receipt_footer_lines ?? [])
          setAutoPrintReceipt(Boolean(conf.printer?.auto_print_receipt ?? true))
          setAutoPrintKitchen(Boolean(conf.printer?.auto_print_kitchen ?? false))
          setPrinterName(conf.printer?.printer_name || 'auto')
        })
      }

      void saveCategories(cats)
      void saveProducts(prods)
      void saveConfig(conf)
      setIsOnline(true)
    } catch (error) {
      const [localCats, localProds, localConf] = await Promise.all([
        getCategories(),
        getProducts(),
        getConfig()
      ])
      if (requestId !== catalogRequestIdRef.current) {
        return
      }
      
      if (localCats.length > 0 || localProds.length > 0 || localConf) {
        const fallbackProducts = (localProds as Product[]).filter((p) => p.active !== false)
        const fallbackConfig = localConf ? (localConf as StoreConfigResponse) : null
        const snapshot = buildCatalogSnapshot(localCats as Category[], fallbackProducts, fallbackConfig)
        if (snapshot !== catalogSnapshotRef.current) {
          catalogSnapshotRef.current = snapshot
          startTransition(() => {
            if (localCats.length > 0) setCategories(localCats as Category[])
            if (localProds.length > 0) setProducts(fallbackProducts)
            if (fallbackConfig) {
              setCategoryImages(fallbackConfig.category_images ?? {})
              setPointValueReal(Number(fallbackConfig.point_value_real ?? 0))
              setMinRedeemPoints(Number(fallbackConfig.min_redeem_points ?? 0))
              setAgentUrl(fallbackConfig.printer?.agent_url?.trim() ?? '')
              setStoreLabel(fallbackConfig.store_name || 'Sorveteria POS')
              setCompanyName(fallbackConfig.company_name || '')
              setStoreCnpj(fallbackConfig.cnpj || '')
              setStoreAddress(fallbackConfig.address || '')
              setReceiptHeaderLines(fallbackConfig.receipt_header_lines ?? [])
              setReceiptFooterLines(fallbackConfig.receipt_footer_lines ?? [])
              setAutoPrintReceipt(Boolean(fallbackConfig.printer?.auto_print_receipt ?? true))
              setAutoPrintKitchen(Boolean(fallbackConfig.printer?.auto_print_kitchen ?? false))
              setPrinterName(fallbackConfig.printer?.printer_name || 'auto')
            }
          })
        }
        setFeedback({ type: 'ok', text: 'Modo offline: usando dados locais.' })
      }
      if (isNetworkError(error)) {
        setIsOnline(false)
      }
    }
  }, [])

  const fetchOpenOrders = useCallback(async (options?: { targetOrderId?: string | null; refreshSelectedDetail?: boolean }) => {
    const requestId = ++openOrdersRequestIdRef.current
    const refreshSelectedDetail = options?.refreshSelectedDetail ?? true
    try {
      const response = await api.get<OrderSummary[]>('/api/orders/open?include_items=0')
      if (requestId !== openOrdersRequestIdRef.current) {
        return
      }
      applyOpenOrders(response.data)
      void syncLocalOpenOrders(response.data)
      setIsOnline(true)
      let nextSelectedOrderId = selectedOrderIdRef.current
      if (typeof options?.targetOrderId !== 'undefined') {
        nextSelectedOrderId = options.targetOrderId
      }
      const nextSelectedSummary = nextSelectedOrderId
        ? response.data.find((order) => order.id === nextSelectedOrderId) ?? null
        : null
      if (!nextSelectedSummary) {
        nextSelectedOrderId = null
      }
      if (selectedOrderIdRef.current !== nextSelectedOrderId) {
        selectedOrderIdRef.current = nextSelectedOrderId
        setSelectedOrderId(nextSelectedOrderId)
      } else {
        selectedOrderIdRef.current = nextSelectedOrderId
      }
      if (nextSelectedSummary && selectedOrderRef.current?.id === nextSelectedSummary.id) {
        mergeSelectedOrderSummary(nextSelectedSummary)
      }
      if (nextSelectedOrderId && (refreshSelectedDetail || selectedOrderRef.current?.id !== nextSelectedOrderId)) {
        await fetchOrderDetail(nextSelectedOrderId)
      } else {
        if (!nextSelectedOrderId) {
          selectedOrderRef.current = null
          setSelectedOrder(null)
        }
        return
      }
    } catch (error) {
      if (requestId !== openOrdersRequestIdRef.current) {
        return
      }
      const localOrders = (await listLocalOrders<Order | OrderSummary>()).map((order) => normalizeOrder(order as Order))
      if (localOrders.length > 0) {
        applyOpenOrders(localOrders.map((order) => toOrderSummary(order)))
        let nextSelectedOrderId = selectedOrderIdRef.current
        if (typeof options?.targetOrderId !== 'undefined') {
          nextSelectedOrderId = options.targetOrderId
        }
        const fallbackOrder = nextSelectedOrderId ? localOrders.find((order) => order.id === nextSelectedOrderId) ?? null : null
        if (fallbackOrder) {
          selectedOrderIdRef.current = fallbackOrder.id
          selectedOrderRef.current = fallbackOrder
          startTransition(() => {
            setSelectedOrder(fallbackOrder)
            setSelectedOrderId(fallbackOrder.id)
          })
        } else {
          selectedOrderIdRef.current = localOrders[0]?.id ?? null
          selectedOrderRef.current = localOrders[0] ?? null
          startTransition(() => {
            setSelectedOrder(localOrders[0] ?? null)
            setSelectedOrderId(localOrders[0]?.id ?? null)
          })
        }
      }
      if (isNetworkError(error)) {
        setIsOnline(false)
      }
    }
  }, [applyOpenOrders, fetchOrderDetail, mergeSelectedOrderSummary])

  const refreshOpenOrdersInBackground = useCallback((targetOrderId?: string | null) => {
    void fetchOpenOrders({ targetOrderId, refreshSelectedDetail: false })
  }, [fetchOpenOrders])

  const getProductName = useCallback((productId: number) => productsById.get(productId)?.name ?? `Produto ${productId}`, [productsById])

  const handleSelectOrder = useCallback((orderId: string) => {
    if (selectedOrderIdRef.current === orderId && selectedOrderRef.current?.id === orderId) {
      return
    }
    selectedOrderIdRef.current = orderId
    setSelectedOrderId(orderId)
    void fetchOrderDetail(orderId)
  }, [fetchOrderDetail])

  const handleRefreshOpenOrders = useCallback(() => {
    void fetchOpenOrders({ refreshSelectedDetail: true })
  }, [fetchOpenOrders])

  const handleRefreshCatalog = useCallback(() => {
    void fetchCatalog()
  }, [fetchCatalog])

  const fetchCashStatus = useCallback(async () => {
    try {
      const response = await api.get<CashStatusResponse>('/api/cash/status')
      const isOpen = Boolean(response.data.open)
      setCashOpen(isOpen)
      if (isOpen) {
        lastCashValidationAtRef.current = Date.now()
      }
    } catch {
      if (!window.navigator.onLine) {
        setCashOpen(true)
        return
      }
      setCashOpen(false)
    }
  }, [])

  const ensureCashOpen = useCallback(async () => {
    const recentlyValidated = Date.now() - lastCashValidationAtRef.current < 15000
    if (cashOpen && (recentlyValidated || !isOnline)) {
      if (!recentlyValidated && isOnline) {
        void fetchCashStatus()
      }
      return true
    }
    try {
      const response = await api.get<CashStatusResponse>('/api/cash/status')
      const isOpen = Boolean(response.data.open)
      setCashOpen(isOpen)
      if (isOpen) {
        lastCashValidationAtRef.current = Date.now()
      }
      if (!isOpen) {
        setFeedback({ type: 'error', text: 'Caixa fechado. Abra o caixa antes de operar pedidos.' })
      }
      return isOpen
    } catch {
      // Se estiver offline ou falhar, confiamos no estado local ou permitimos se offline
      if (!isOnline) {
        setCashOpen(true)
        return true 
      }
      setCashOpen(false)
      setFeedback({ type: 'error', text: 'Nao foi possivel validar o caixa. Confira a conexao com o servidor.' })
      return false
    }
  }, [cashOpen, fetchCashStatus, isOnline])

  useEffect(() => {
    const handleStatus = () => {
      setIsOnline(window.navigator.onLine)
      void refreshOutboxState()
    }
    const handleOutboxChanged = () => {
      void refreshOutboxState()
    }
    window.addEventListener('online', handleStatus)
    window.addEventListener('offline', handleStatus)
    window.addEventListener('sorveteria:outbox-changed', handleOutboxChanged)
    handleStatus()
    return () => {
      window.removeEventListener('online', handleStatus)
      window.removeEventListener('offline', handleStatus)
      window.removeEventListener('sorveteria:outbox-changed', handleOutboxChanged)
    }
  }, [refreshOutboxState])

  useEffect(() => {
    void fetchCatalog()
    void fetchOpenOrders({ refreshSelectedDetail: true })
    void fetchCashStatus()
  }, [fetchCatalog, fetchOpenOrders, fetchCashStatus])

  useEffect(() => {
    const ws = connectWS('/ws/pdv', (data) => {
      const scheduleRefresh = (options?: { orders?: boolean; cash?: boolean }) => {
        if (document.visibilityState !== 'visible') {
          return
        }
        if (wsRefreshTimerRef.current !== null) {
          window.clearTimeout(wsRefreshTimerRef.current)
        }
        wsRefreshTimerRef.current = window.setTimeout(() => {
          if (document.visibilityState !== 'visible') {
            return
          }
          if (options?.orders) {
            refreshOpenOrdersInBackground()
          }
          if (options?.cash) {
            void fetchCashStatus()
          }
        }, PDV_REFRESH_DEBOUNCE_MS)
      }
      if (data?.event === 'order_paid' || data?.event === 'order_canceled') {
        scheduleRefresh({ orders: true, cash: true })
      }
      if (data?.event === 'cash_move_created' || data?.event === 'cash_status_changed') {
        scheduleRefresh({ cash: true })
      }
      if (data?.event === 'order_status_changed' || data?.event === 'order_ready') {
        scheduleRefresh({ orders: true })
      }
    })
    return () => {
      ws.close()
      if (wsRefreshTimerRef.current !== null) {
        window.clearTimeout(wsRefreshTimerRef.current)
      }
    }
  }, [fetchCashStatus, refreshOpenOrdersInBackground])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return
      }
      refreshOpenOrdersInBackground(selectedOrderIdRef.current)
      void fetchCashStatus()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchCashStatus, refreshOpenOrdersInBackground])

  useEffect(() => {
    const loadLoyalty = async () => {
      if (!selectedOrder?.customer) {
        setLoyaltyBalance(0)
        setPointsToRedeem('0')
        return
      }
      try {
        const response = await api.get<CustomerLookupResponse>(
          `/api/loyalty/customer?customer_id=${selectedOrder.customer}`
        )
        setLoyaltyBalance(Number(response.data.account?.points_balance ?? 0))
      } catch {
        setLoyaltyBalance(0)
      }
      setPointsToRedeem('0')
    }
    void loadLoyalty()
  }, [selectedOrder?.id, selectedOrder?.customer])

  const resetNewOrderModal = () => {
    setNewOrderStep('phone')
    setPhone('')
    setFirstName('')
    setLastName('')
    setNeighborhood('')
    setLoadingCreateOrder(false)
  }

  const openNewOrderModal = useCallback(async () => {
    const canOperate = await ensureCashOpen()
    if (!canOperate) {
      return
    }
    resetNewOrderModal()
    setShowNewOrderModal(true)
  }, [ensureCashOpen])

  const createOrder = async (options?: { includeProfile: boolean }) => {
    setLoadingCreateOrder(true)
    setFeedback(null)
    const payload: Record<string, string> = {
      type: 'COUNTER',
      client_request_id: crypto.randomUUID()
    }
    if (phone.trim()) {
      payload.customer_phone = phone.trim()
    }
    if (options?.includeProfile) {
      payload.customer_name = firstName.trim()
      payload.customer_last_name = lastName.trim()
      payload.customer_neighborhood = neighborhood.trim()
    }
    try {
      const response = await api.post<Order>('/api/orders', payload)
      const createdOrder = normalizeOrder(response.data)
      applyOrderSnapshot(createdOrder)
      setShowNewOrderModal(false)
      resetNewOrderModal()
      setFeedback({ type: 'ok', text: 'Pedido criado com sucesso.' })
      setIsOnline(true)
      refreshOpenOrdersInBackground(createdOrder.id)
      return true
    } catch (error: any) {
      if (error.enqueued) {
        const localId = (payload.client_request_id as string) || crypto.randomUUID()
        const localOrder: Order = {
          id: localId,
          display_number: 'OFFLINE',
          status: 'OPEN',
          subtotal: '0',
          discount: '0',
          total: '0',
          client_request_id: localId,
          local_only: true,
          customer_phone: (payload.customer_phone as string) || null,
          customer_name: (payload.customer_name as string) || (payload.customer_phone ? 'Cliente' : 'Balcao'),
          items: []
        }
        applyOrderSnapshot(localOrder)
        setShowNewOrderModal(false)
        resetNewOrderModal()
        setFeedback({ type: 'ok', text: 'Modo Offline: Pedido criado localmente.' })
        setIsOnline(false)
        return true
      }
      setFeedback({ type: 'error', text: getApiErrorText(error, 'Nao foi possivel criar o pedido.') })
      return false
    } finally {
      setLoadingCreateOrder(false)
    }
  }

  const handlePhoneStep = async () => {
    const cleanPhone = phone.trim()
    if (!cleanPhone) {
      setFeedback({ type: 'error', text: 'Informe o telefone do cliente.' })
      return
    }

    setLoadingCreateOrder(true)
    setFeedback(null)
    try {
      await api.get<CustomerLookupResponse>(`/api/loyalty/customer?phone=${encodeURIComponent(cleanPhone)}`)
      await createOrder()
    } catch (error: unknown) {
      const status = getHttpStatus(error)
      if (status === 404) {
        setNewOrderStep('profile')
      } else {
        const ok = await createOrder()
        if (ok) {
          setFeedback({ type: 'ok', text: 'Pedido criado sem validacao de telefone (modo contingencia).' })
        }
      }
    } finally {
      setLoadingCreateOrder(false)
    }
  }

  const handleCreateOrderWithoutPhone = async () => {
    const ok = await createOrder()
    if (ok) {
      setFeedback({ type: 'ok', text: 'Pedido criado sem telefone.' })
    }
  }



  const handleCreateFirstOrder = async () => {
    if (!firstName.trim() || !lastName.trim() || !neighborhood.trim()) {
      setFeedback({ type: 'error', text: 'Preencha nome, sobrenome e bairro para o primeiro pedido.' })
      return
    }
    await createOrder({ includeProfile: true })
  }

  const handleConfirmAddProduct = async () => {
    if (addingQtyItemRef.current) {
      return
    }
    addingQtyItemRef.current = true
    setAddingQtyItem(true)
    try {
      if (!qtyProduct) {
        return
      }
      if (!(await ensureCashOpen())) {
        return
      }
      const qty = Number(qtyInput.replace(',', '.'))
      if (!Number.isFinite(qty) || qty <= 0) {
        setFeedback({ type: 'error', text: 'Quantidade invalida.' })
        return
      }

      const orderId = selectedOrderId
      if (!orderId) {
        setShowQtyModal(false)
        setQtyProduct(null)
        setQtyInput('1')
        setFeedback({ type: 'error', text: 'Crie/selecione um pedido antes de adicionar itens.' })
        return
      }

      const payload = {
        product_id: qtyProduct.id,
        qty,
        client_request_id: crypto.randomUUID()
      }
      try {
        const response = await api.post<OrderItem>(`/api/orders/${orderId}/items`, payload)
        if (selectedOrder && selectedOrder.id === orderId) {
          applyOrderSnapshot(addItemToOrder(selectedOrder, response.data))
        }
        setFeedback({ type: 'ok', text: 'Item adicionado ao pedido.' })
        setShowQtyModal(false)
        setQtyProduct(null)
        setQtyInput('1')
        setIsOnline(true)
      } catch (error: any) {
        if (error.enqueued) {
          if (selectedOrder && selectedOrder.id === orderId) {
            applyOrderSnapshot(
              addItemToOrder(selectedOrder, {
                id: Math.floor(Math.random() * 1000000),
                product: qtyProduct.id,
                qty,
                client_request_id: payload.client_request_id,
                total: 0,
              })
            )
          }
          setFeedback({ type: 'ok', text: 'Modo Offline: Item adicionado localmente.' })
          setShowQtyModal(false)
          setQtyProduct(null)
          setQtyInput('1')
          setIsOnline(false)
          return
        }
        setFeedback({ type: 'error', text: getApiErrorText(error, 'Nao foi possivel adicionar o item no pedido.') })
      }
    } finally {
      addingQtyItemRef.current = false
      setAddingQtyItem(false)
    }
  }

  const handleAddProduct = useCallback(async (product: Product) => {
    if (!(await ensureCashOpen())) {
      return
    }
    if (!selectedOrderId) {
      setFeedback({ type: 'error', text: 'Crie ou selecione um pedido antes de adicionar itens.' })
      return
    }
    if (product.sold_by_weight) {
      setScaleProduct(product)
      setShowScaleModal(true)
      return
    }
    setQtyProduct(product)
    setQtyInput('1')
    setShowQtyModal(true)
  }, [ensureCashOpen, selectedOrderId])

  const handleOpenNewOrder = useCallback(() => {
    void openNewOrderModal()
  }, [openNewOrderModal])

  const handleAddProductClick = useCallback((product: Product) => {
    void handleAddProduct(product)
  }, [handleAddProduct])

  const handleConfirmScaleProduct = async (weightGrams: number) => {
    if (addingScaleItemRef.current) {
      return
    }
    addingScaleItemRef.current = true
    setAddingScaleItem(true)
    try {
      if (!scaleProduct) {
        return
      }
      if (!(await ensureCashOpen())) {
        return
      }

      const orderId = selectedOrderId
      if (!orderId) {
        setShowScaleModal(false)
        setScaleProduct(null)
        setFeedback({ type: 'error', text: 'Crie/selecione um pedido antes de adicionar itens.' })
        return
      }

      const payload = {
        product_id: scaleProduct.id,
        qty: round3(weightGrams / 1000),
        weight_grams: weightGrams,
        client_request_id: crypto.randomUUID()
      }

      try {
        const response = await api.post<OrderItem>(`/api/orders/${orderId}/items`, payload)
        if (selectedOrder && selectedOrder.id === orderId) {
          applyOrderSnapshot(addItemToOrder(selectedOrder, response.data))
        }
        setFeedback({ type: 'ok', text: 'Item adicionado ao pedido.' })
        setShowScaleModal(false)
        setScaleProduct(null)
        setIsOnline(true)
      } catch (error: any) {
        if (error.enqueued) {
          if (selectedOrder && selectedOrder.id === orderId) {
            applyOrderSnapshot(
              addItemToOrder(selectedOrder, {
                id: Math.floor(Math.random() * 1000000),
                product: scaleProduct.id,
                qty: payload.qty,
                client_request_id: payload.client_request_id,
                weight_grams: weightGrams,
                total: 0,
              })
            )
          }
          setFeedback({ type: 'ok', text: 'Modo Offline: Item de balanca adicionado localmente.' })
          setShowScaleModal(false)
          setScaleProduct(null)
          setIsOnline(false)
          return
        }
        setFeedback({ type: 'error', text: getApiErrorText(error, 'Nao foi possivel adicionar o item no pedido.') })
      }
    } finally {
      addingScaleItemRef.current = false
      setAddingScaleItem(false)
    }
  }

  const handleSendKitchen = async () => {
    if (!selectedOrder) {
      setFeedback({ type: 'error', text: 'Selecione um pedido.' })
      return
    }
    if (!(await ensureCashOpen())) {
      return
    }
    try {
      await api.post(`/api/orders/${selectedOrder.id}/send-kitchen`)
      if (autoPrintKitchen) {
        const printed = await printKitchenTicket(selectedOrder)
        if (!printed) {
          refreshOpenOrdersInBackground()
          setFeedback({ type: 'error', text: 'Pedido enviado para cozinha, mas a impressao falhou.' })
          return
        }
      }
      applyOrderSnapshot({ ...selectedOrder, status: 'SENT' })
      refreshOpenOrdersInBackground(selectedOrder.id)
      setFeedback({ type: 'ok', text: 'Pedido enviado para cozinha.' })
    } catch (error: any) {
      if (error.enqueued) {
        applyOrderSnapshot({ ...selectedOrder, status: 'SENT' })
        setFeedback({ type: 'ok', text: 'Modo Offline: pedido marcado para envio a cozinha.' })
        setIsOnline(false)
        return
      }
      setFeedback({ type: 'error', text: 'Falha ao enviar para cozinha.' })
    }
  }

  const handleEditItem = useCallback(async (item: OrderItem) => {
    if (!selectedOrder) {
      setFeedback({ type: 'error', text: 'Selecione um pedido.' })
      return
    }
    const qtyInput = window.prompt('Nova quantidade:', String(item.qty))
    if (!qtyInput) {
      return
    }
    const qty = Number(qtyInput.replace(',', '.'))
    if (!Number.isFinite(qty) || qty <= 0) {
      setFeedback({ type: 'error', text: 'Quantidade invalida.' })
      return
    }
    const notesInput = window.prompt('Observacao (opcional):', item.notes ?? '')
    const nextOrder = updateItemInOrder(selectedOrder, item.id, {
      qty,
      notes: notesInput ?? item.notes ?? '',
    })
    if (selectedOrder.local_only) {
      applyOrderSnapshot(nextOrder)
      await rebuildLocalOnlyOrderQueue(nextOrder)
      setFeedback({ type: 'ok', text: 'Item atualizado localmente e mantido na fila offline.' })
      return
    }
    try {
      await api.put(`/api/orders/${selectedOrder.id}/items/${item.id}`, {
        qty,
        notes: notesInput ?? item.notes ?? ''
      })
      applyOrderSnapshot(nextOrder)
      setFeedback({ type: 'ok', text: 'Item atualizado.' })
    } catch (error: any) {
      if (error.enqueued) {
        applyOrderSnapshot(nextOrder)
        setFeedback({ type: 'ok', text: 'Modo Offline: item atualizado localmente.' })
        setIsOnline(false)
        return
      }
      setFeedback({ type: 'error', text: 'Falha ao editar item.' })
    }
  }, [applyOrderSnapshot, rebuildLocalOnlyOrderQueue, selectedOrder])

  const handleDeleteItem = useCallback(async (item: OrderItem) => {
    if (!selectedOrder) {
      setFeedback({ type: 'error', text: 'Selecione um pedido.' })
      return
    }
    if (!window.confirm('Excluir este item do pedido?')) {
      return
    }
    const nextOrder = removeItemFromOrder(selectedOrder, item.id)
    if (selectedOrder.local_only) {
      applyOrderSnapshot(nextOrder)
      await rebuildLocalOnlyOrderQueue(nextOrder)
      setFeedback({ type: 'ok', text: 'Item removido localmente da fila offline.' })
      return
    }
    try {
      await api.delete(`/api/orders/${selectedOrder.id}/items/${item.id}`)
      applyOrderSnapshot(nextOrder)
      setFeedback({ type: 'ok', text: 'Item removido do pedido.' })
    } catch (error: any) {
      if (error.enqueued) {
        applyOrderSnapshot(nextOrder)
        setFeedback({ type: 'ok', text: 'Modo Offline: item removido localmente.' })
        setIsOnline(false)
        return
      }
      setFeedback({ type: 'error', text: 'Falha ao excluir item.' })
    }
  }, [applyOrderSnapshot, rebuildLocalOnlyOrderQueue, selectedOrder])

  const handleOpenCloseSaleModal = async () => {
    if (!selectedOrder) {
      setFeedback({ type: 'error', text: 'Selecione um pedido.' })
      return
    }
    if (!(await ensureCashOpen())) {
      return
    }
    if (Number(selectedOrder.total) <= 0) {
      setFeedback({ type: 'error', text: 'Adicione itens ao pedido antes de fechar.' })
      return
    }
    const suggestedPoints = selectedOrder.customer ? Math.min(loyaltyBalance, maxPointsByTotal) : 0
    if (suggestedPoints > 0 && suggestedPoints >= minRedeemPoints) {
      setPointsToRedeem(String(suggestedPoints))
    } else {
      setPointsToRedeem('0')
    }
    setShowPaymentModal(true)
  }

  const buildReceiptPayload = useCallback(
    (order: Order, payments: Array<{ method: string; amount: string; meta?: Record<string, string> | null }>) => {
      return {
        company_name: companyName || storeLabel || 'Sorveteria POS',
        address: storeAddress || undefined,
        cnpj: storeCnpj || undefined,
        order_id: getOrderDisplayNumber(order),
        cashier: 'PDV',
        receipt_header_lines: receiptHeaderLines,
        receipt_footer_lines: receiptFooterLines,
        items: order.items.map((item) => ({
          name: productsById.get(item.product)?.name ?? `Produto ${item.product}`,
          qty: Number(item.qty),
          weight_grams: item.weight_grams ?? undefined,
          unit_price: Number(item.total) / Math.max(Number(item.qty) || 1, 1),
          total: Number(item.total),
          notes: item.notes ?? undefined
        })),
        subtotal: Number(order.subtotal),
        discount: Number(order.discount),
        total: payments.length > 0 ? payableTotal : Number(order.total),
        payments: payments.map((payment) => ({
          method: receiptPaymentLabel(payment.method, payment.meta),
          amount: Number(payment.amount),
          note: receiptPaymentNote(payment)
        }))
      }
    },
    [
      companyName,
      payableTotal,
      productsById,
      receiptFooterLines,
      receiptHeaderLines,
      storeAddress,
      storeCnpj,
      storeLabel
    ]
  )

  const postToAgent = useCallback(
    async (path: '/print/receipt' | '/print/kitchen', payload: ThermalReceiptPayload) => {
      const normalizedAgentUrl = agentUrl.trim().replace(/\/$/, '')
      if (!normalizedAgentUrl) {
        return false
      }
      const response = await fetch(`${normalizedAgentUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, printer_name: printerName })
      })
      return response.ok
    },
    [agentUrl]
  )

  const printReceipt = useCallback(
    async (order: Order, payments: Array<{ method: string; amount: string; meta?: Record<string, string> | null }>) => {
      const payload = buildReceiptPayload(order, payments)
      setLastReceiptPayload(payload)
      const printed = await postToAgent('/print/receipt', payload)
      return printed
    },
    [
      buildReceiptPayload,
      postToAgent
    ]
  )

  const printKitchenTicket = useCallback(
    async (order: Order) => {
      const payload = {
        company_name: companyName || storeLabel || 'Sorveteria POS',
        address: storeAddress || undefined,
        order_id: getOrderDisplayNumber(order),
        cashier: 'COZINHA',
        items: order.items.map((item) => ({
          name: productsById.get(item.product)?.name ?? `Produto ${item.product}`,
          qty: Number(item.qty),
          weight_grams: item.weight_grams ?? undefined,
          unit_price: Number(item.total) / Math.max(Number(item.qty) || 1, 1),
          total: Number(item.total),
          notes: item.notes ?? undefined
        })),
        subtotal: Number(order.subtotal),
        discount: Number(order.discount),
        total: Number(order.total),
        payments: []
      }
      return postToAgent('/print/kitchen', payload)
    },
    [companyName, postToAgent, productsById, storeAddress, storeLabel]
  )

  const handleCloseSale = async (entries: PaymentEntry[]) => {
    if (closingSale) {
      return
    }
    if (!selectedOrder) {
      setFeedback({ type: 'error', text: 'Selecione um pedido.' })
      setShowPaymentModal(false)
      return
    }
    if (!(await ensureCashOpen())) {
      setShowPaymentModal(false)
      return
    }
    setClosingSale(true)
    try {
      if (effectiveRedeemPoints > 0 && effectiveRedeemPoints < minRedeemPoints) {
        setFeedback({ type: 'error', text: `Minimo para resgate: ${minRedeemPoints} pontos.` })
        return
      }

      // Converte PaymentEntry[] para o formato do backend
      const payments = entries.map((entry) => {
        if (entry.method === 'CARD_CREDIT') return { method: 'CARD', meta: { card_type: 'CREDIT' }, amount: entry.amount }
        if (entry.method === 'CARD_DEBIT') return { method: 'CARD', meta: { card_type: 'DEBIT' }, amount: entry.amount }
        return { method: entry.method, meta: entry.meta ?? null, amount: entry.amount }
      })

      const payload = {
        discount: '0',
        payments,
        use_loyalty_points: effectiveRedeemPoints > 0,
        points_to_redeem: effectiveRedeemPoints > 0 ? effectiveRedeemPoints : undefined,
        client_request_id: crypto.randomUUID()
      }

      try {
        await api.post(`/api/orders/${selectedOrder.id}/close`, payload)
        setIsOnline(true)
      } catch (error: any) {
        if (error.enqueued) {
          setOpenOrders(prev => prev.filter(o => o.id !== selectedOrder.id))
          setSelectedOrder(null)
          setSelectedOrderId(null)
          void removeLocalOrder(selectedOrder.id)
          setFeedback({ type: 'ok', text: 'Modo Offline: Venda salva localmente para sincronizar.' })
          setShowPaymentModal(false)
          setIsOnline(false)
          return
        }
        throw error
      }

      let printed = false
      if (autoPrintReceipt) {
        try {
          printed = await printReceipt(selectedOrder, payments)
        } catch {
          printed = false
        }
      }
      setShowPaymentModal(false)
      setOpenOrders((prev) => prev.filter((order) => order.id !== selectedOrder.id))
      setSelectedOrder(null)
      setSelectedOrderId(null)
      void removeLocalOrder(selectedOrder.id)
      refreshOpenOrdersInBackground()
      void fetchCashStatus()
      setPointsToRedeem('0')
      const successText =
        effectiveRedeemPoints > 0
          ? `Venda fechada. ${effectiveRedeemPoints} pontos aplicados no desconto.`
          : 'Venda fechada com sucesso.'
      const receiptPayload = buildReceiptPayload(selectedOrder, payments)
      const pdfOpened = !printed && autoPrintReceipt ? openThermalReceiptPdf(receiptPayload) : false
      setFeedback({
        type: printed || !autoPrintReceipt || pdfOpened ? 'ok' : 'error',
        text:
          printed || !autoPrintReceipt
            ? successText
            : pdfOpened
              ? `${successText} Cupom aberto para imprimir/salvar em PDF.`
              : `${successText} Impressao da comanda falhou.`
      })
    } catch (error: unknown) {
      setFeedback({ type: 'error', text: getApiErrorText(error, 'Falha ao fechar venda.') })
    } finally {
      setClosingSale(false)
    }
  }

  const handleCancelOrder = async () => {
    if (!selectedOrder) {
      setFeedback({ type: 'error', text: 'Selecione um pedido.' })
      return
    }
    const confirmed = window.confirm(`Cancelar apenas o pedido ${getOrderDisplayNumber(selectedOrder)}?`)
    if (!confirmed) {
      return
    }
    const reason = window.prompt('Motivo do cancelamento:')
    if (!reason || !reason.trim()) {
      return
    }
    if (selectedOrder.local_only) {
      await discardLocalOrder(selectedOrder)
      setFeedback({ type: 'ok', text: 'Pedido local cancelado e removido da fila offline.' })
      return
    }
    try {
      await api.post(`/api/orders/${selectedOrder.id}/cancel`, { reason: reason.trim() })
      setOpenOrders((prev) => prev.filter((order) => order.id !== selectedOrder.id))
      setSelectedOrder(null)
      setSelectedOrderId(null)
      void removeLocalOrder(selectedOrder.id)
      refreshOpenOrdersInBackground()
      setFeedback({ type: 'ok', text: 'Pedido cancelado.' })
    } catch (error: any) {
      if (error.enqueued) {
        setOpenOrders((prev) => prev.filter((order) => order.id !== selectedOrder.id))
        setSelectedOrder(null)
        setSelectedOrderId(null)
        void removeLocalOrder(selectedOrder.id)
        setFeedback({ type: 'ok', text: 'Modo Offline: cancelamento salvo para sincronizar.' })
        setIsOnline(false)
        return
      }
      setFeedback({ type: 'error', text: 'Falha ao cancelar pedido.' })
    }
  }

  const handleDeleteOrder = async () => {
    if (!selectedOrder) {
      setFeedback({ type: 'error', text: 'Selecione um pedido.' })
      return
    }
    if (!window.confirm('Deseja excluir este pedido?')) {
      return
    }
    if (selectedOrder.local_only) {
      await discardLocalOrder(selectedOrder)
      setFeedback({ type: 'ok', text: 'Pedido local removido da fila offline.' })
      return
    }
    try {
      await api.delete(`/api/orders/${selectedOrder.id}`)
      setOpenOrders((prev) => prev.filter((order) => order.id !== selectedOrder.id))
      setSelectedOrder(null)
      setSelectedOrderId(null)
      void removeLocalOrder(selectedOrder.id)
      refreshOpenOrdersInBackground()
      setFeedback({ type: 'ok', text: 'Pedido excluido.' })
    } catch (error: any) {
      if (error.enqueued) {
        setOpenOrders((prev) => prev.filter((order) => order.id !== selectedOrder.id))
        setSelectedOrder(null)
        setSelectedOrderId(null)
        void removeLocalOrder(selectedOrder.id)
        setFeedback({ type: 'ok', text: 'Modo Offline: exclusao salva para sincronizar.' })
        setIsOnline(false)
        return
      }
      setFeedback({ type: 'error', text: 'Falha ao excluir pedido.' })
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_260px] xl:grid-cols-[280px_minmax(0,1fr)_minmax(0,1.2fr)]">
        <aside className="order-3 space-y-4 rounded-2xl lg:order-3 xl:order-1">
          <OpenOrdersPanel
            openOrders={openOrders}
            selectedOrderId={selectedOrderId}
            outboxCount={outboxCount}
            outboxPreview={outboxPreview}
            isOnline={isOnline}
            canOperateOrders={canOperateOrders}
            pendingSyncOrderKeys={pendingSyncOrderKeys}
            onRefresh={handleRefreshOpenOrders}
            onSelectOrder={handleSelectOrder}
            onOpenNewOrder={handleOpenNewOrder}
          />
        </aside>

        <section className="order-1 min-w-0 space-y-4 lg:order-1 xl:order-2">
          <div className="panel p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Pedido atual</h2>
              <div className="flex flex-col items-end gap-1">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {selectedOrder ? `Pedido #${getOrderDisplayNumber(selectedOrder)}` : 'Sem pedido selecionado'}
                </span>
                {isOrderPendingSync(selectedOrder) ? (
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Pendente de sincronizacao
                  </span>
                ) : null}
                {selectedOrder ? (
                  <span className="text-xs text-slate-500">
                    Cliente: {selectedOrder.customer_name || selectedOrder.customer_phone || 'Nao informado'}
                  </span>
                ) : null}
              </div>
            </div>
            <OrderPanel
              items={selectedOrder?.items ?? []}
              subtotal={selectedOrder?.subtotal ?? '0'}
              discount={selectedOrder?.discount ?? '0'}
              total={selectedOrder?.total ?? '0'}
              getProductName={getProductName}
              onEditItem={handleEditItem}
              onDeleteItem={handleDeleteItem}
            />
          </div>

          <div className="panel p-4 md:p-5 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Acoes rapidas</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <button
                onClick={() => void handleSendKitchen()}
                disabled={!canOperateOrders}
                className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enviar cozinha
              </button>
              <button
                onClick={() => void handleOpenCloseSaleModal()}
                disabled={!canOperateOrders}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Fechar venda
              </button>
              <button
                onClick={() => {
                  void (async () => {
                    if (!lastReceiptPayload) {
                      setFeedback({ type: 'error', text: 'Nenhuma comanda impressa recentemente.' })
                      return
                    }
                    try {
                      const ok = await postToAgent('/print/receipt', lastReceiptPayload)
                      const pdfOpened = !ok ? openThermalReceiptPdf(lastReceiptPayload) : false
                      setFeedback({
                        type: ok || pdfOpened ? 'ok' : 'error',
                        text: ok
                          ? 'Ultima comanda reimpressa.'
                          : pdfOpened
                            ? 'Ultima comanda aberta para imprimir/salvar em PDF.'
                            : 'Falha ao reimprimir a ultima comanda.'
                      })
                    } catch {
                      const pdfOpened = openThermalReceiptPdf(lastReceiptPayload)
                      setFeedback({
                        type: pdfOpened ? 'ok' : 'error',
                        text: pdfOpened
                          ? 'Ultima comanda aberta para imprimir/salvar em PDF.'
                          : 'Falha ao reimprimir a ultima comanda.'
                      })
                    }
                  })()
                }}
                className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700"
              >
                Reimprimir
              </button>
              <button onClick={() => void handleCancelOrder()} className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                Cancelar
              </button>
              <button onClick={() => void handleDeleteOrder()} className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                Excluir
              </button>
            </div>
            {feedback ? (
              <p className={`text-sm ${feedback.type === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}>
                {feedback.text}
              </p>
            ) : null}
          </div>

        </section>

        <aside className="order-2 min-w-0 lg:order-2 xl:order-3">
          <div className="panel p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Categorias</h2>
            <button
              onClick={handleRefreshCatalog}
              className="rounded-lg border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
            >
              Atualizar
            </button>
          </div>
          <ProductGrid
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            products={visibleProducts}
            allProducts={products}
            searchTerm={productSearchTerm}
            searchResultProducts={searchResultProducts}
            categoryImages={categoryImages}
            onSelectCategory={setSelectedCategoryId}
            onSearchTermChange={setProductSearchTerm}
            onAddProduct={handleAddProductClick}
          />
          </div>
        </aside>
      </div>

      {showNewOrderModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 px-4 pb-4 sm:items-center sm:pb-0">
          <div className="mobile-sheet w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Novo pedido</h3>
            <p className="mt-1 text-sm text-slate-500">
              {newOrderStep === 'phone' ? 'Digite o telefone do cliente ou siga sem telefone.' : 'Primeira compra: complete o cadastro.'}
            </p>

            <div className="mt-4 space-y-3">
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Telefone"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />

              {newOrderStep === 'profile' ? (
                <>
                  <input
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="Nome"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    placeholder="Sobrenome"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    value={neighborhood}
                    onChange={(event) => setNeighborhood(event.target.value)}
                    placeholder="Bairro"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </>
              ) : null}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={() => setShowNewOrderModal(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">
                Cancelar
              </button>
              {newOrderStep === 'phone' ? (
                <>
                  <button
                    onClick={() => void handleCreateOrderWithoutPhone()}
                    disabled={loadingCreateOrder}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                  >
                    {loadingCreateOrder ? 'Criando...' : 'Sem telefone'}
                  </button>
                  <button
                    onClick={() => void handlePhoneStep()}
                    disabled={loadingCreateOrder}
                    className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {loadingCreateOrder ? 'Validando...' : 'Continuar'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => void handleCreateFirstOrder()}
                  disabled={loadingCreateOrder}
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {loadingCreateOrder ? 'Criando...' : 'Criar pedido'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <PaymentModal
        open={showPaymentModal}
        total={selectedOrder?.total ?? '0'}
        orderLabel={selectedOrder ? `#${getOrderDisplayNumber(selectedOrder)}` : undefined}
        customerLabel={selectedOrder?.customer_name ?? selectedOrder?.customer_phone ?? undefined}
        canUsePoints={Boolean(selectedOrder?.customer)}
        pointsBalance={loyaltyBalance}
        pointValueReal={pointValueReal}
        minRedeemPoints={minRedeemPoints}
        pointsToRedeem={pointsToRedeem}
        onChangePointsToRedeem={setPointsToRedeem}
        effectivePoints={effectiveRedeemPoints}
        discountByPoints={pointsDiscount}
        payableTotal={payableTotal}
        onCancel={() => setShowPaymentModal(false)}
        onConfirm={(entries) => void handleCloseSale(entries)}
        loading={closingSale}
      />

      {showQtyModal && qtyProduct ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 px-4 pb-4 sm:items-center sm:pb-0">
          <div className="mobile-sheet w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Adicionar item</h3>
            <p className="mt-1 text-sm text-slate-500">{qtyProduct.name}</p>
            <div className="mt-4">
              <label className="text-sm font-medium text-slate-700">Quantidade</label>
              <input
                value={qtyInput}
                onChange={(event) => setQtyInput(event.target.value)}
                autoFocus
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="Ex.: 1"
              />
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => {
                  setShowQtyModal(false)
                  setQtyProduct(null)
                  setQtyInput('1')
                }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleConfirmAddProduct()}
                disabled={addingQtyItem}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {addingQtyItem ? 'Adicionando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showScaleModal ? (
        <ScaleProductModal
          product={scaleProduct}
          agentUrl={agentUrl}
          onCancel={() => {
            setShowScaleModal(false)
            setScaleProduct(null)
          }}
          onConfirm={(weightGrams) => void handleConfirmScaleProduct(weightGrams)}
          onError={(message) => setFeedback({ type: 'error', text: message })}
        />
      ) : null}
    </>
  )
}

export default PDV
