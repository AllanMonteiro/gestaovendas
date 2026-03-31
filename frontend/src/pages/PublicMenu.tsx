import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'

type Product = {
  id: number
  name: string
  description?: string
  image_url?: string | null
  category: number
  active?: boolean
}

type Category = {
  id: number
  name: string
}

type ProductPrice = {
  product: number
  price: string
}

type StoreConfig = {
  store_name?: string
  whatsapp_number?: string | null
}

type CartItem = {
  product: Product
  qty: number
}

type CreatedOrderResponse = {
  id: string
  total: string
}

const formatBRL = (val: string | number) => Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

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

const PublicMenu: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [pricesByProductId, setPricesByProductId] = useState<Record<number, string>>({})
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [storeName, setStoreName] = useState('Nossa Sorveteria')
  const [storeWhatsAppNumber, setStoreWhatsAppNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [address, setAddress] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [cep, setCep] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('PIX')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [lastOrderId, setLastOrderId] = useState('')
  const [lastWhatsAppUrl, setLastWhatsAppUrl] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [cats, prods, config] = await Promise.all([
          api.get<Category[]>('/api/categories'),
          api.get<Product[]>('/api/products'),
          api.get<StoreConfig>('/api/config/ui')
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
        setPricesByProductId(nextPrices)
        if (cats.data.length > 0) {
          setSelectedCategoryId(cats.data[0].id)
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

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + getProductPrice(item.product.id) * item.qty, 0),
    [cart, pricesByProductId]
  )

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        return prev.map((item) => (item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item))
      }
      return [...prev, { product, qty: 1 }]
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
    setCart((prev) => prev.filter((item) => item.product.id !== productId))
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
      const response = await api.post<CreatedOrderResponse>('/api/orders/public/', {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || undefined,
        address: address.trim(),
        neighborhood: neighborhood.trim(),
        cep: cep.trim() || undefined,
        notes: notes.trim() || undefined,
        payment_method: paymentMethod,
        items: cart.map((item) => ({
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.qty,
        })),
      })
      const orderLabel = response.data.id.slice(0, 8)
      const whatsappMessage = [
        `Ola! Acabei de fazer o pedido ${orderLabel} no cardapio online da ${storeName}.`,
        `Cliente: ${customerName.trim()}.`,
        `Forma de pagamento escolhida: ${paymentMethod}.`,
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
    <div className="min-h-screen bg-slate-50 pb-40">
      <header className="sticky top-0 z-30 bg-white/90 p-4 shadow-sm backdrop-blur-md">
        <h1 className="text-center font-display text-2xl font-bold text-brand-700">{storeName}</h1>
        <p className="mt-1 text-center text-xs uppercase tracking-widest text-slate-500">Faca seu pedido online</p>
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

      <nav className="scrollbar-none sticky top-[68px] z-20 flex gap-3 overflow-x-auto border-b border-brand-50 bg-white p-3">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategoryId(cat.id)}
            className={`shrink-0 rounded-full px-5 py-2 text-sm font-semibold transition ${
              selectedCategoryId === cat.id ? 'bg-brand-600 text-white shadow-md' : 'bg-brand-50 text-brand-700'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </nav>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 p-4 lg:grid-cols-[minmax(0,1.2fr)_360px]">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filteredProducts.map((product) => (
            <div key={product.id} className="flex gap-3 rounded-2xl border border-brand-50 bg-white p-3 shadow-sm">
              <div className="h-20 w-20 shrink-0 rounded-xl bg-slate-100">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="h-full w-full rounded-xl object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl">SG</div>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <h3 className="font-bold text-slate-800">{product.name}</h3>
                  <p className="line-clamp-2 text-xs text-slate-400">{product.description || 'Sabor irresistivel'}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-brand-600">{formatBRL(getProductPrice(product.id))}</span>
                  <button
                    onClick={() => addToCart(product)}
                    className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700"
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Seu pedido</p>
                <p className="text-2xl font-bold text-slate-900">{formatBRL(total)}</p>
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
                  <div key={item.product.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">{item.product.name}</p>
                        <p className="text-sm text-slate-500">{formatBRL(getProductPrice(item.product.id))} por unidade</p>
                      </div>
                      <button onClick={() => removeFromCart(item.product.id)} className="text-sm font-semibold text-rose-500">
                        Remover
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => changeQty(item.product.id, -1)} className="h-8 w-8 rounded-full border border-slate-200">
                          -
                        </button>
                        <span className="min-w-8 text-center font-semibold">{item.qty}</span>
                        <button onClick={() => changeQty(item.product.id, 1)} className="h-8 w-8 rounded-full border border-slate-200">
                          +
                        </button>
                      </div>
                      <span className="font-bold text-slate-800">{formatBRL(getProductPrice(item.product.id) * item.qty)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Entrega</p>
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
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand-400"
              >
                <option value="PIX">Pagar no PIX</option>
                <option value="CARD">Cartao</option>
                <option value="CASH">Dinheiro</option>
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
                className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Enviando pedido...' : 'Enviar pedido para a loja'}
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}

export default PublicMenu
