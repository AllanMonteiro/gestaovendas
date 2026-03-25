import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { openThermalReceiptPdf, type ThermalReceiptPayload } from '../app/thermalReceipt'
import { ProductGrid } from '../components/ProductGrid'
import { OrderPanel } from '../components/OrderPanel'
import { PaymentModal, type PaymentEntry, type PaymentMethod } from '../components/PaymentModal'

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
  customer?: number | null
  customer_name?: string | null
  customer_phone?: string | null
  items: OrderItem[]
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
    width_mm?: number
    auto_print_receipt?: boolean
    auto_print_kitchen?: boolean
  }
}

type CashStatusResponse = {
  open: boolean
}

const formatBRL = (value: string | number) => {
  const numberValue = Number(value || 0)
  return numberValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100


const receiptPaymentLabel = (method: string, meta?: Record<string, string> | null) => {
  if (method === 'CARD') {
    if (meta?.card_type === 'CREDIT') return 'Cartao credito'
    if (meta?.card_type === 'DEBIT') return 'Cartao debito'
    return 'Cartao'
  }
  if (method === 'PIX') return 'PIX'
  return 'Dinheiro'
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

const PDV: React.FC = () => {
  const [openOrders, setOpenOrders] = useState<Order[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

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
  const [lastReceiptPayload, setLastReceiptPayload] = useState<ThermalReceiptPayload | null>(null)
  const [showScaleModal, setShowScaleModal] = useState(false)
  const [scaleProduct, setScaleProduct] = useState<Product | null>(null)
  const [scaleWeight, setScaleWeight] = useState<number | null>(null)
  const [scaleLoading, setScaleLoading] = useState(false)

  const selectedOrder = useMemo(
    () => openOrders.find((order) => order.id === selectedOrderId) ?? null,
    [openOrders, selectedOrderId]
  )

  const productsById = useMemo(() => {
    const map = new Map<number, Product>()
    products.forEach((product) => map.set(product.id, product))
    return map
  }, [products])

  const searchResultProducts = useMemo(() => {
    const normalizedSearch = productSearchTerm.trim().toLowerCase()
    if (!normalizedSearch) {
      return []
    }
    return products.filter((product) => product.name.toLowerCase().includes(normalizedSearch))
  }, [products, productSearchTerm])

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

  const fetchCatalog = useCallback(async () => {
    try {
      const [categoriesResp, productsResp, configResp] = await Promise.all([
        api.get<Category[]>('/api/categories'),
        api.get<Product[]>('/api/products'),
        api.get<StoreConfigResponse>('/api/config')
      ])
      setCategories(categoriesResp.data)
      setProducts(productsResp.data.filter((item) => item.active !== false))
      setCategoryImages(configResp.data.category_images ?? {})
      setPointValueReal(Number(configResp.data.point_value_real ?? 0))
      setMinRedeemPoints(Number(configResp.data.min_redeem_points ?? 0))
      setAgentUrl(configResp.data.printer?.agent_url?.trim() ?? '')
      setStoreLabel(configResp.data.store_name || 'Sorveteria POS')
      setCompanyName(configResp.data.company_name || '')
      setStoreCnpj(configResp.data.cnpj || '')
      setStoreAddress(configResp.data.address || '')
      setReceiptHeaderLines(configResp.data.receipt_header_lines ?? [])
      setReceiptFooterLines(configResp.data.receipt_footer_lines ?? [])
      setAutoPrintReceipt(Boolean(configResp.data.printer?.auto_print_receipt ?? true))
      setAutoPrintKitchen(Boolean(configResp.data.printer?.auto_print_kitchen ?? false))
    } catch {
      setFeedback({ type: 'error', text: 'Falha ao carregar categorias/produtos.' })
    }
  }, [])

  const fetchOpenOrders = useCallback(async (targetOrderId?: string | null) => {
    try {
      const response = await api.get<Order[]>('/api/orders/open')
      setOpenOrders(response.data)
      if (typeof targetOrderId !== 'undefined') {
        const exists = targetOrderId ? response.data.some((order) => order.id === targetOrderId) : false
        setSelectedOrderId(exists ? targetOrderId : null)
        return
      }
      if (selectedOrderId && !response.data.some((order) => order.id === selectedOrderId)) {
        setSelectedOrderId(null)
      }
    } catch {
      setFeedback({ type: 'error', text: 'Falha ao carregar comandas abertas.' })
    }
  }, [selectedOrderId])

  const fetchCashStatus = useCallback(async () => {
    try {
      const response = await api.get<CashStatusResponse>('/api/cash/status')
      setCashOpen(Boolean(response.data.open))
    } catch {
      setCashOpen(false)
    }
  }, [])

  const ensureCashOpen = useCallback(async () => {
    try {
      const response = await api.get<CashStatusResponse>('/api/cash/status')
      const isOpen = Boolean(response.data.open)
      setCashOpen(isOpen)
      if (!isOpen) {
        setFeedback({ type: 'error', text: 'Caixa fechado. Abra o caixa antes de operar pedidos.' })
      }
      return isOpen
    } catch {
      setCashOpen(false)
      setFeedback({ type: 'error', text: 'Nao foi possivel validar o caixa. Confira a conexao com o servidor.' })
      return false
    }
  }, [])

  useEffect(() => {
    void fetchCatalog()
    void fetchOpenOrders()
    void fetchCashStatus()
  }, [fetchCatalog, fetchOpenOrders, fetchCashStatus])

  useEffect(() => {
    const loadLoyalty = async () => {
      if (!selectedOrder?.customer && !selectedOrder?.customer_phone) {
        setLoyaltyBalance(0)
        setPointsToRedeem('0')
        return
      }
      try {
        let response
        if (selectedOrder?.customer) {
          response = await api.get<CustomerLookupResponse>(
            `/api/loyalty/customer?customer_id=${selectedOrder.customer}`
          )
        } else {
          response = await api.get<CustomerLookupResponse>(
            `/api/loyalty/customer?phone=${encodeURIComponent(selectedOrder.customer_phone || '')}`
          )
        }
        setLoyaltyBalance(Number(response.data.account?.points_balance ?? 0))
      } catch {
        setLoyaltyBalance(0)
      }
      setPointsToRedeem('0')
    }
    void loadLoyalty()
  }, [selectedOrder?.id, selectedOrder?.customer, selectedOrder?.customer_phone])

  const resetNewOrderModal = () => {
    setNewOrderStep('phone')
    setPhone('')
    setFirstName('')
    setLastName('')
    setNeighborhood('')
    setLoadingCreateOrder(false)
  }

  const openNewOrderModal = async () => {
    const canOperate = await ensureCashOpen()
    if (!canOperate) {
      return
    }
    resetNewOrderModal()
    setShowNewOrderModal(true)
  }

  const createOrder = async (options?: { includeProfile: boolean }) => {
    setLoadingCreateOrder(true)
    setFeedback(null)
    try {
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
      const response = await api.post<Order>('/api/orders', payload)
      await fetchOpenOrders(response.data.id)
      setShowNewOrderModal(false)
      resetNewOrderModal()
      setFeedback({ type: 'ok', text: 'Pedido criado com sucesso.' })
      return true
    } catch (error: unknown) {
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

    try {
      const orderId = selectedOrderId
      if (!orderId) {
        setFeedback({ type: 'error', text: 'Crie/selecione um pedido com cliente antes de adicionar itens.' })
        return
      }

      await api.post(`/api/orders/${orderId}/items`, {
        product_id: qtyProduct.id,
        qty
      })
      await fetchOpenOrders(orderId)
      setFeedback({ type: 'ok', text: 'Item adicionado ao pedido.' })
      setShowQtyModal(false)
      setQtyProduct(null)
      setQtyInput('1')
    } catch (error: unknown) {
      setFeedback({ type: 'error', text: getApiErrorText(error, 'Nao foi possivel adicionar o item no pedido.') })
    }
  }

  const handleAddProduct = async (product: Product) => {
    if (!(await ensureCashOpen())) {
      return
    }
    if (product.sold_by_weight) {
      setScaleProduct(product)
      setScaleWeight(null)
      setShowScaleModal(true)
      return
    }
    setQtyProduct(product)
    setQtyInput('1')
    setShowQtyModal(true)
  }

  const fetchScaleWeight = async () => {
    if (!agentUrl) {
      setFeedback({ type: 'error', text: 'URL do Agent nao configurada.' })
      return
    }
    setScaleLoading(true)
    try {
      const normalizedAgentUrl = agentUrl.trim().replace(/\/$/, '')
      const response = await fetch(`${normalizedAgentUrl}/scale/weight`)
      if (!response.ok) throw new Error()
      const data = await response.json()
      setScaleWeight(data.grams ?? 0)
    } catch {
      setFeedback({ type: 'error', text: 'Falha ao ler balanca. Confira se o Agent esta rodando.' })
    } finally {
      setScaleLoading(false)
    }
  }

  const handleConfirmScaleProduct = async () => {
    if (!scaleProduct || scaleWeight === null) {
      return
    }
    if (!(await ensureCashOpen())) {
      return
    }

    try {
      const orderId = selectedOrderId
      if (!orderId) {
        setFeedback({ type: 'error', text: 'Crie/selecione um pedido antes de adicionar itens.' })
        return
      }

      await api.post(`/api/orders/${orderId}/items`, {
        product_id: scaleProduct.id,
        qty: round2(scaleWeight / 1000),
        weight_grams: scaleWeight
      })
      await fetchOpenOrders(orderId)
      setFeedback({ type: 'ok', text: 'Item adicionado ao pedido.' })
      setShowScaleModal(false)
      setScaleProduct(null)
      setScaleWeight(null)
    } catch (error: unknown) {
      setFeedback({ type: 'error', text: getApiErrorText(error, 'Nao foi possivel adicionar o item no pedido.') })
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
          await fetchOpenOrders()
          setFeedback({ type: 'error', text: 'Pedido enviado para cozinha, mas a impressao falhou.' })
          return
        }
      }
      await fetchOpenOrders()
      setFeedback({ type: 'ok', text: 'Pedido enviado para cozinha.' })
    } catch {
      setFeedback({ type: 'error', text: 'Falha ao enviar para cozinha.' })
    }
  }

  const handleEditItem = async (item: OrderItem) => {
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
    try {
      await api.put(`/api/orders/${selectedOrder.id}/items/${item.id}`, {
        qty,
        notes: notesInput ?? item.notes ?? ''
      })
      await fetchOpenOrders()
      setFeedback({ type: 'ok', text: 'Item atualizado.' })
    } catch {
      setFeedback({ type: 'error', text: 'Falha ao editar item.' })
    }
  }

  const handleDeleteItem = async (item: OrderItem) => {
    if (!selectedOrder) {
      setFeedback({ type: 'error', text: 'Selecione um pedido.' })
      return
    }
    if (!window.confirm('Excluir este item do pedido?')) {
      return
    }
    try {
      await api.delete(`/api/orders/${selectedOrder.id}/items/${item.id}`)
      await fetchOpenOrders()
      setFeedback({ type: 'ok', text: 'Item removido do pedido.' })
    } catch {
      setFeedback({ type: 'error', text: 'Falha ao excluir item.' })
    }
  }

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
    const suggestedPoints = Math.min(loyaltyBalance, maxPointsByTotal)
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
          amount: Number(payment.amount)
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
        body: JSON.stringify(payload)
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
        return { method: entry.method, meta: null, amount: entry.amount }
      })

      await api.post(`/api/orders/${selectedOrder.id}/close`, {
        discount: '0',
        payments,
        use_loyalty_points: effectiveRedeemPoints > 0,
        points_to_redeem: effectiveRedeemPoints > 0 ? effectiveRedeemPoints : undefined,
        client_request_id: crypto.randomUUID()
      })
      let printed = false
      if (autoPrintReceipt) {
        try {
          printed = await printReceipt(selectedOrder, payments)
        } catch {
          printed = false
        }
      }
      setShowPaymentModal(false)
      await fetchOpenOrders()
      await fetchCashStatus()
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
    try {
      await api.post(`/api/orders/${selectedOrder.id}/cancel`, { reason: reason.trim() })
      setSelectedOrderId(null)
      await fetchOpenOrders()
      setFeedback({ type: 'ok', text: 'Pedido cancelado.' })
    } catch {
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
    try {
      await api.delete(`/api/orders/${selectedOrder.id}`)
      await fetchOpenOrders()
      setFeedback({ type: 'ok', text: 'Pedido excluido.' })
    } catch {
      setFeedback({ type: 'error', text: 'Falha ao excluir pedido.' })
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <aside className="order-2 space-y-4 rounded-2xl 2xl:order-1">
          <div className="panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Comandas abertas</h2>
            <button onClick={() => void fetchOpenOrders()} className="text-xs font-semibold text-brand-700">
              Atualizar
            </button>
          </div>
          <div className="mt-4 max-h-[48vh] space-y-2 overflow-y-auto pr-1">
            {openOrders.map((order) => (
              <div
                key={order.id}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                  selectedOrderId === order.id ? 'border-brand-500 bg-brand-50' : 'border-brand-100 bg-brand-50/60'
                }`}
              >
                <button className="w-full text-left" onClick={() => setSelectedOrderId(order.id)}>
                  <div className="font-semibold">Pedido {getOrderDisplayNumber(order)} | {formatBRL(order.total)}</div>
                  <div className="text-xs text-slate-600">
                    Cliente: {order.customer_name || order.customer_phone || 'Nao informado'}
                  </div>
                </button>

                {selectedOrderId === order.id ? (
                  <div className="mt-2 space-y-2 border-t border-brand-100 pt-2">
                    {order.items.length === 0 ? (
                      <p className="text-xs text-slate-500">Sem itens nesta comanda.</p>
                    ) : (
                      order.items.map((item) => (
                        <div key={item.id} className="rounded-lg border border-brand-100 bg-white px-2 py-1">
                          <p className="text-xs font-medium">{productsById.get(item.product)?.name ?? `Produto ${item.product}`}</p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-600">Qtd: {Number(item.qty)}</span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedOrderId(order.id)
                                  void handleEditItem(item)
                                }}
                                className="rounded border border-indigo-300 px-2 py-0.5 text-[11px] font-semibold text-indigo-700"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedOrderId(order.id)
                                  void handleDeleteItem(item)
                                }}
                                className="rounded border border-rose-300 px-2 py-0.5 text-[11px] font-semibold text-rose-700"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            ))}
            {openOrders.length === 0 ? <p className="text-sm text-slate-500">Sem comandas abertas.</p> : null}
          </div>
          <button
            onClick={() => void openNewOrderModal()}
            disabled={!cashOpen}
            title={!cashOpen ? 'Abra o caixa para criar pedido.' : undefined}
            className="w-full rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Novo pedido
          </button>
          </div>
        </aside>

        <section className="order-1 min-w-0 space-y-4 2xl:order-2">
          <div className="panel p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Pedido atual</h2>
              <div className="flex flex-col items-end gap-1">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {selectedOrder ? `Pedido #${getOrderDisplayNumber(selectedOrder)}` : 'Sem pedido selecionado'}
                </span>
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
              getProductName={(productId: number) => productsById.get(productId)?.name ?? `Produto ${productId}`}
              onEditItem={(item) => void handleEditItem(item)}
              onDeleteItem={(item) => void handleDeleteItem(item)}
            />
          </div>

          <div className="panel p-4 md:p-5 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Acoes rapidas</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <button
                onClick={() => void handleSendKitchen()}
                disabled={!cashOpen}
                className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enviar cozinha
              </button>
              <button
                onClick={() => void handleOpenCloseSaleModal()}
                disabled={!cashOpen}
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

        <aside className="order-3 min-w-0 lg:col-span-2 2xl:col-span-1 2xl:order-3">
          <div className="panel p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Categorias</h2>
            <button
              onClick={() => void fetchCatalog()}
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
            onAddProduct={(product) => void handleAddProduct(product)}
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
        canUsePoints={Boolean(selectedOrder?.customer || selectedOrder?.customer_phone)}
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
              <button onClick={() => void handleConfirmAddProduct()} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showScaleModal && scaleProduct ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 px-4 pb-4 sm:items-center sm:pb-0">
          <div className="mobile-sheet w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Produto por Peso</h3>
            <p className="mt-1 text-sm text-slate-500">{scaleProduct.name}</p>
            
            <div className="mt-6 flex flex-col items-center justify-center rounded-2xl bg-slate-50 py-8 border-2 border-dashed border-slate-200">
              {scaleWeight !== null ? (
                <div className="text-center">
                  <span className="text-4xl font-bold text-brand-700">{scaleWeight}g</span>
                  <p className="mt-1 text-sm font-medium text-slate-500">{(scaleWeight / 1000).toFixed(3)} kg</p>
                </div>
              ) : (
                <div className="text-center text-slate-400">
                  <span className="text-lg">Aguardando leitura...</span>
                </div>
              )}
            </div>

            <button
              onClick={() => void fetchScaleWeight()}
              disabled={scaleLoading}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50"
            >
              {scaleLoading ? 'Lendo...' : 'Obter peso da balanca'}
            </button>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => {
                  setShowScaleModal(false)
                  setScaleProduct(null)
                  setScaleWeight(null)
                }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleConfirmScaleProduct()}
                disabled={scaleWeight === null || scaleWeight <= 0}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Confirmar e Adicionar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default PDV