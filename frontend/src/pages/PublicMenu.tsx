import React, { startTransition, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { resolveAssetUrl } from '../app/runtime'

type Product = {
  id: number
  name: string
  description?: string
  image_url?: string | null
  category: number
  active?: boolean
  sold_by_weight?: boolean
}

type Category = {
  id: number
  name: string
}

type ProductPrice = {
  product: number
  price: string
}

type DeliveryFeeRule = {
  label?: string
  neighborhood?: string
  fee?: string
}

type StoreConfig = {
  store_name?: string
  logo_url?: string | null
  whatsapp_number?: string | null
  delivery_fee_default?: string
  delivery_fee_rules?: DeliveryFeeRule[]
}

type CartItem = {
  id: string
  product: Product
  qty: number
  weightGrams?: number | null
}

type CreatedOrderResponse = {
  id: string
  total: string
}

type DeliveryFeeEstimate = {
  fee: number
  matchedRuleLabel: string | null
}

type DeliveryPaymentMethod = 'PIX' | 'CASH' | 'CARD_CREDIT' | 'CARD_DEBIT'

const formatBRL = (val: string | number) => Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const priceUnitLabel = (product: Product) => (product.sold_by_weight ? '/ kg' : '/ un')
const cartUnitLabel = (product: Product) => (product.sold_by_weight ? 'por kg' : 'por unidade')
const round3 = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000
const formatWeight = (weightGrams?: number | null) => `${((weightGrams ?? 0) / 1000).toFixed(3)} kg`
const createCartItemId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const paymentMethodLabel: Record<DeliveryPaymentMethod, string> = {
  PIX: 'PIX',
  CASH: 'Dinheiro',
  CARD_CREDIT: 'Cartao credito',
  CARD_DEBIT: 'Cartao debito',
}

const normalizeWhatsAppNumber = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) {
    return ''
  }
  if (digits.startsWith('55')) {
    return digits
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }
  return digits
}

const normalizeNeighborhood = (value?: string | null) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')

const parseFee = (value?: string | number | null, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

const resolveEstimatedDeliveryFee = (
  neighborhood: string,
  defaultFee: string | number,
  rules: DeliveryFeeRule[]
): DeliveryFeeEstimate => {
  const fallback = parseFee(defaultFee, 10)
  const normalizedNeighborhood = normalizeNeighborhood(neighborhood)

  if (!normalizedNeighborhood) {
    return { fee: fallback, matchedRuleLabel: null }
  }

  for (const rule of rules) {
    const label = String(rule.label || rule.neighborhood || '').trim()
    if (normalizeNeighborhood(label) === normalizedNeighborhood) {
      return {
        fee: parseFee(rule.fee, fallback),
        matchedRuleLabel: label || null,
      }
    }
  }

  return { fee: fallback, matchedRuleLabel: null }
}

const PublicMenu: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [pricesByProductId, setPricesByProductId] = useState<Record<number, string>>({})
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [storeName, setStoreName] = useState('Nossa Sorveteria')
  const [storeWhatsAppNumber, setStoreWhatsAppNumber] = useState('')
  const [deliveryFeeDefault, setDeliveryFeeDefault] = useState('10.00')
  const [deliveryFeeRules, setDeliveryFeeRules] = useState<DeliveryFeeRule[]>([])
  const [storeLogoUrl, setStoreLogoUrl] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [address, setAddress] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [cep, setCep] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<DeliveryPaymentMethod>('PIX')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [lastOrderId, setLastOrderId] = useState('')
  const [lastWhatsAppUrl, setLastWhatsAppUrl] = useState('')
  const [weightModalProduct, setWeightModalProduct] = useState<Product | null>(null)
  const [editingWeightCartItemId, setEditingWeightCartItemId] = useState<string | null>(null)
  const [weightInput, setWeightInput] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [cats, prods, config] = await Promise.all([
          api.get<Category[]>('/api/categories'),
          api.get<Product[]>('/api/products'),
          api.get<StoreConfig>('/api/config/public-menu')
        ])

        const activeProducts = prods.data.filter((product) => product.active !== false)
        const productIds = activeProducts.map((product) => product.id).join(',')
        const pricesResp = productIds
          ? await api.get<ProductPrice[]>(`/api/products/prices?product_ids=${productIds}`)
          : { data: [] as ProductPrice[] }

        const nextPrices: Record<number, string> = {}
        for (const entry of pricesResp.data) {
          nextPrices[entry.product] = entry.price
        }

        setCategories(cats.data)
        setProducts(activeProducts)
        setStoreName(config.data.store_name || 'Nossa Sorveteria')
        setStoreWhatsAppNumber(normalizeWhatsAppNumber(config.data.whatsapp_number))
        setStoreLogoUrl(config.data.logo_url || '')
        setDeliveryFeeDefault(String(config.data.delivery_fee_default ?? '10.00'))
        setDeliveryFeeRules(Array.isArray(config.data.delivery_fee_rules) ? config.data.delivery_fee_rules : [])
        setPricesByProductId(nextPrices)
        if (cats.data.length > 0) {
          startTransition(() => {
            setSelectedCategoryId(cats.data[0].id)
          })
        }
      } catch {
        setFeedback({ type: 'error', text: 'Nao foi possivel carregar o cardapio agora.' })
      }
    }

    void load()
  }, [])

  const getProductPrice = (productId: number) => Number(pricesByProductId[productId] || 0)

  const filteredProducts = useMemo(
    () => (selectedCategoryId ? products.filter((product) => product.category === selectedCategoryId) : products),
    [products, selectedCategoryId]
  )

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + getProductPrice(item.product.id) * item.qty, 0),
    [cart, pricesByProductId]
  )

  const deliveryFeeEstimate = useMemo(
    () => resolveEstimatedDeliveryFee(neighborhood, deliveryFeeDefault, deliveryFeeRules),
    [neighborhood, deliveryFeeDefault, deliveryFeeRules]
  )

  const knownNeighborhoods = useMemo(() => {
    const seen = new Set<string>()
    return deliveryFeeRules
      .map((rule) => String(rule.label || rule.neighborhood || '').trim())
      .filter((label) => {
        if (!label) {
          return false
        }
        const normalized = normalizeNeighborhood(label)
        if (seen.has(normalized)) {
          return false
        }
        seen.add(normalized)
        return true
      })
  }, [deliveryFeeRules])

  const total = subtotal + deliveryFeeEstimate.fee

  const addToCart = (product: Product) => {
    if (product.sold_by_weight) {
      setWeightModalProduct(product)
      setEditingWeightCartItemId(null)
      setWeightInput('')
      setFeedback(null)
      return
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id && !item.weightGrams)
      if (existing) {
        return prev.map((item) => (item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item))
      }
      return [...prev, { id: createCartItemId(), product, qty: 1, weightGrams: null }]
    })
    setFeedback(null)
  }

  const changeQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => (item.product.id === productId ? { ...item, qty: Math.max(item.qty + delta, 0) } : item))
        .filter((item) => item.qty > 0)
    )
  }

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.id !== String(productId)))
  }

  const removeCartItem = (cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== cartItemId))
  }

  const openEditWeightModal = (item: CartItem) => {
    setWeightModalProduct(item.product)
    setEditingWeightCartItemId(item.id)
    setWeightInput(item.weightGrams ? String(item.weightGrams) : '')
    setFeedback(null)
  }

  const closeWeightModal = () => {
    setWeightModalProduct(null)
    setEditingWeightCartItemId(null)
    setWeightInput('')
  }

  const parsedWeightGrams = useMemo(() => {
    const normalized = weightInput.trim().replace(',', '.')
    if (!normalized) {
      return null
    }
    const parsed = Number(normalized)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null
    }
    return Math.round(parsed)
  }, [weightInput])

  const confirmWeightSelection = () => {
    if (!weightModalProduct || parsedWeightGrams === null) {
      return
    }

    const qty = round3(parsedWeightGrams / 1000)
    setCart((prev) => {
      if (editingWeightCartItemId) {
        return prev.map((item) =>
          item.id === editingWeightCartItemId
            ? { ...item, qty, weightGrams: parsedWeightGrams }
            : item
        )
      }

      return [
        ...prev,
        {
          id: createCartItemId(),
          product: weightModalProduct,
          qty,
          weightGrams: parsedWeightGrams,
        },
      ]
    })
    closeWeightModal()
  }

  const resetForm = () => {
    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setAddress('')
    setNeighborhood('')
    setCep('')
    setNotes('')
      setPaymentMethod('PIX')
  }

  const handleSubmitOrder = async () => {
    if (cart.length === 0) {
      setFeedback({ type: 'error', text: 'Adicione ao menos um item ao carrinho.' })
      return
    }
    if (!customerName.trim() || !address.trim() || !neighborhood.trim()) {
      setFeedback({ type: 'error', text: 'Preencha nome, endereco e bairro para enviar o pedido.' })
      return
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      const paymentMethodText = paymentMethodLabel[paymentMethod] || paymentMethod
      const response = await api.post<CreatedOrderResponse>('/api/orders/public/', {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || undefined,
        address: address.trim(),
        neighborhood: neighborhood.trim(),
        cep: cep.trim() || undefined,
        notes: notes.trim() || undefined,
        payment_method: paymentMethodText,
        items: cart.map((item) => ({
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.qty,
          weight_grams: item.weightGrams ?? undefined,
        })),
      })
      const orderLabel = response.data.id.slice(0, 8)
      const whatsappMessage = [
        `Ola! Acabei de fazer o pedido ${orderLabel} no cardapio online da ${storeName}.`,
        `Cliente: ${customerName.trim()}.`,
        `Forma de pagamento escolhida: ${paymentMethodText}.`,
        'Quero continuar por aqui para receber os dados de pagamento com mais seguranca.'
      ].join(' ')
      const whatsappUrl = storeWhatsAppNumber
        ? `https://wa.me/${storeWhatsAppNumber}?text=${encodeURIComponent(whatsappMessage)}`
        : ''

      setLastOrderId(response.data.id)
      setLastWhatsAppUrl(whatsappUrl)
      setFeedback({
        type: 'ok',
        text: whatsappUrl
          ? `Pedido ${orderLabel} enviado com sucesso. Agora vamos continuar no WhatsApp da loja para combinar o pagamento.`
          : `Pedido ${orderLabel} enviado com sucesso.`
      })
      if (whatsappUrl) {
        window.setTimeout(() => {
          window.location.assign(whatsappUrl)
        }, 250)
      }
      resetForm()
    } catch (error: any) {
      const message = error?.response?.data?.detail || 'Nao foi possivel enviar seu pedido agora.'
      setFeedback({ type: 'error', text: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.12),_transparent_28%),linear-gradient(180deg,#fffaf5_0%,#fffdfb_38%,#ffffff_100%)] pb-40">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/72 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="rounded-[1.75rem] border border-white/70 bg-white/70 px-4 py-4 shadow-sm shadow-slate-200/60 backdrop-blur-xl">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[1.2rem] border border-brand-100 bg-white">
                {storeLogoUrl ? (
                  <img src={resolveAssetUrl(storeLogoUrl)} alt={`Logo de ${storeName}`} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-bold uppercase tracking-[0.18em] text-brand-700">
                    {(storeName || 'SP').slice(0, 2)}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand-600/80">Delivery online</p>
                <h1 className="truncate font-display text-2xl font-bold tracking-[0.01em] text-slate-900">{storeName}</h1>
                <p className="mt-1 text-sm text-slate-500">Monte seu pedido, escolha a taxa estimada e finalize em poucos passos.</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {feedback ? (
        <div className="mx-auto mt-4 max-w-5xl px-4">
          <div
            className={`rounded-2xl border p-4 text-sm ${
              feedback.type === 'ok'
                ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                : 'border-rose-100 bg-rose-50 text-rose-800'
            }`}
          >
            {feedback.text}
            {feedback.type === 'ok' && lastWhatsAppUrl ? (
              <div className="mt-3">
                <a
                  href={lastWhatsAppUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
                >
                  Continuar no WhatsApp
                </a>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="sticky top-[112px] z-20">
        <nav className="scrollbar-none mx-auto flex max-w-6xl gap-3 overflow-x-auto px-4 py-3">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`shrink-0 rounded-full px-5 py-2 text-sm font-semibold transition ${
                selectedCategoryId === cat.id
                  ? 'bg-slate-900 text-white shadow-sm shadow-slate-300'
                  : 'border border-slate-200/80 bg-white/78 text-slate-700 backdrop-blur hover:border-brand-300 hover:text-brand-700'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </nav>
      </div>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 p-4 lg:grid-cols-[minmax(0,1.2fr)_360px]">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filteredProducts.map((product) => (
            <div key={product.id} className="group flex gap-4 rounded-[1.6rem] border border-white/70 bg-white/82 p-4 shadow-sm shadow-slate-200/60 backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200">
              <div className="h-24 w-24 shrink-0 rounded-[1.15rem] bg-slate-100">
                {product.image_url ? (
                  <img src={resolveAssetUrl(product.image_url)} alt={product.name} className="h-full w-full rounded-[1.15rem] object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-[1.15rem] bg-[linear-gradient(135deg,rgba(217,90,43,0.14),rgba(239,155,82,0.22))] text-xl font-bold text-brand-700">
                    {product.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-slate-900">{product.name}</h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {product.sold_by_weight ? 'Peso' : 'Unidade'}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{product.description || 'Sabor irresistivel preparado para pedido rapido.'}</p>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-900">{formatBRL(getProductPrice(product.id))}</span>
                    <span className="ml-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">{priceUnitLabel(product)}</span>
                  </div>
                  <button
                    onClick={() => addToCart(product)}
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                  >
                    {product.sold_by_weight ? 'Informar peso' : 'Adicionar'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </section>

        <aside className="space-y-4">
          <div className="rounded-[1.8rem] border border-white/70 bg-white/84 p-5 shadow-sm shadow-slate-200/60 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Resumo do pedido</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{formatBRL(total)}</p>
              </div>
              {lastOrderId ? (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Ultimo pedido {lastOrderId.slice(0, 8)}
                </span>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              {cart.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Seu carrinho ainda esta vazio.
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.id} className="rounded-[1.35rem] border border-slate-100 bg-slate-50/90 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">{item.product.name}</p>
                        <p className="text-sm text-slate-500">{formatBRL(getProductPrice(item.product.id))} {cartUnitLabel(item.product)}</p>
                        {item.weightGrams ? (
                          <p className="text-xs text-slate-500">Peso informado: {formatWeight(item.weightGrams)}</p>
                        ) : null}
                      </div>
                      <button onClick={() => removeCartItem(item.id)} className="text-sm font-semibold text-rose-500">
                        Remover
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      {item.product.sold_by_weight ? (
                        <button
                          onClick={() => openEditWeightModal(item)}
                          className="rounded-full border border-slate-200 px-3 py-1 text-sm font-medium text-slate-600"
                        >
                          Editar peso
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button onClick={() => changeQty(item.product.id, -1)} className="h-8 w-8 rounded-full border border-slate-200">
                            -
                          </button>
                          <span className="min-w-8 text-center font-semibold">{item.qty}</span>
                          <button onClick={() => changeQty(item.product.id, 1)} className="h-8 w-8 rounded-full border border-slate-200">
                            +
                          </button>
                        </div>
                      )}
                      <span className="font-bold text-slate-800">{formatBRL(getProductPrice(item.product.id) * item.qty)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal dos itens</span>
                <span>{formatBRL(subtotal)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-slate-600">
                <span>Taxa de entrega estimada</span>
                <span>{formatBRL(deliveryFeeEstimate.fee)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 font-bold text-slate-900">
                <span>Total com entrega</span>
                <span>{formatBRL(total)}</span>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {neighborhood.trim()
                  ? deliveryFeeEstimate.matchedRuleLabel
                    ? `Taxa estimada para o bairro ${deliveryFeeEstimate.matchedRuleLabel}.`
                    : 'Bairro fora da lista cadastrada. A taxa padrao da loja foi aplicada.'
                  : 'Informe seu bairro para confirmar a taxa. Enquanto isso, mostramos a taxa padrao da loja.'}
              </p>
            </div>
          </div>

          <div className="rounded-[1.8rem] border border-white/70 bg-white/84 p-5 shadow-sm shadow-slate-200/60 backdrop-blur-xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Entrega</p>
            <div className="mt-4 space-y-3">
              <input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Seu nome"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand-400"
              />
              <input
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="Telefone"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand-400"
              />
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Endereco"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand-400"
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  value={neighborhood}
                  onChange={(event) => setNeighborhood(event.target.value)}
                  list={knownNeighborhoods.length > 0 ? 'delivery-neighborhoods' : undefined}
                  placeholder="Bairro"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand-400"
                />
                <input
                  value={cep}
                  onChange={(event) => setCep(event.target.value)}
                  placeholder="CEP"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand-400"
                />
              </div>
              {knownNeighborhoods.length > 0 ? (
                <>
                  <datalist id="delivery-neighborhoods">
                    {knownNeighborhoods.map((label) => (
                      <option key={label} value={label} />
                    ))}
                  </datalist>
                  <p className="text-xs text-slate-500">
                    Comece a digitar seu bairro para selecionar um dos bairros cadastrados pela loja.
                  </p>
                </>
              ) : null}
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as DeliveryPaymentMethod)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand-400"
              >
                <option value="PIX">Pagar no PIX</option>
                <option value="CASH">Dinheiro</option>
                <option value="CARD_CREDIT">Cartao credito</option>
                <option value="CARD_DEBIT">Cartao debito</option>
              </select>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Observacoes do pedido"
                rows={4}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand-400"
              />
              <button
                onClick={() => void handleSubmitOrder()}
                disabled={submitting || cart.length === 0}
                className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-slate-300 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Enviando pedido...' : 'Enviar pedido para a loja'}
              </button>
            </div>
          </div>
        </aside>
      </main>

      {weightModalProduct ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 px-4 pb-4 sm:items-center sm:pb-0">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Produto por peso</h3>
            <p className="mt-1 text-sm text-slate-500">{weightModalProduct.name}</p>

            <div className="mt-6 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-6 text-center">
              <span className="text-4xl font-bold text-brand-700">{parsedWeightGrams ?? 0}g</span>
              <p className="mt-1 text-sm font-medium text-slate-500">{formatWeight(parsedWeightGrams)}</p>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold uppercase text-slate-500">Digite o peso em gramas</label>
              <input
                type="text"
                inputMode="decimal"
                value={weightInput}
                onChange={(event) => setWeightInput(event.target.value)}
                placeholder="Ex: 500"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition-all focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              {weightInput.trim() && parsedWeightGrams === null ? (
                <p className="mt-1 text-xs font-medium text-rose-600">Digite um peso valido em gramas.</p>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={closeWeightModal} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">
                Cancelar
              </button>
              <button
                onClick={confirmWeightSelection}
                disabled={parsedWeightGrams === null}
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Confirmar peso
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default PublicMenu
