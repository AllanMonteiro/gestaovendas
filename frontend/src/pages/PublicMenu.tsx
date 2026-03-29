import React, { useEffect, useState } from 'react'
import { api } from '../api/client'

type Product = {
  id: number
  name: string
  description?: string
  image_url?: string | null
  category: number
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
  whatsapp_phone?: string | null
}

const formatBRL = (val: string | number) => Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const PublicMenu: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [pricesByProductId, setPricesByProductId] = useState<Record<number, string>>({})
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [cart, setCart] = useState<{ product: Product; qty: number }[]>([])
  const [storeName, setStoreName] = useState('Nossa Sorveteria')
  const [storePhone, setStorePhone] = useState('')

  useEffect(() => {
    const load = async () => {
      const [cats, prods, config] = await Promise.all([
        api.get<Category[]>('/api/categories'),
        api.get<Product[]>('/api/products'),
        api.get<StoreConfig>('/api/config/ui')
      ])

      const productIds = prods.data.map((product) => product.id).join(',')
      const pricesResp = productIds
        ? await api.get<ProductPrice[]>(`/api/products/prices?product_ids=${productIds}`)
        : { data: [] as ProductPrice[] }

      const nextPrices: Record<number, string> = {}
      for (const entry of pricesResp.data) {
        nextPrices[entry.product] = entry.price
      }

      setCategories(cats.data)
      setProducts(prods.data)
      setStoreName(config.data.store_name || 'Nossa Sorveteria')
      setStorePhone((config.data.whatsapp_phone || '').trim())
      setPricesByProductId(nextPrices)
      if (cats.data.length > 0) {
        setSelectedCategoryId(cats.data[0].id)
      }
    }

    void load()
  }, [])

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        return prev.map((item) => (item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item))
      }
      return [...prev, { product, qty: 1 }]
    })
  }

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId))
  }

  const getProductPrice = (productId: number) => Number(pricesByProductId[productId] || 0)

  const total = cart.reduce((sum, item) => sum + getProductPrice(item.product.id) * item.qty, 0)

  const handleSendOrder = () => {
    if (cart.length === 0) return

    let message = `*NOVO PEDIDO - ${storeName}*\n\n`
    message += cart
      .map((item) => `- ${item.qty}x ${item.product.name} (${formatBRL(getProductPrice(item.product.id))})`)
      .join('\n')
    message += `\n\n*TOTAL: ${formatBRL(total)}*`
    message += `\n\n*DADOS PARA ENTREGA:*\n`
    message += 'Nome:\nEndereco:\nBairro:\nReferencia:'

    const encoded = encodeURIComponent(message)
    const phone = storePhone.replace(/\D/g, '')
    window.location.href = phone
      ? `https://wa.me/${phone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`
  }

  const filteredProducts = selectedCategoryId ? products.filter((product) => product.category === selectedCategoryId) : products

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      <header className="sticky top-0 z-30 bg-white/90 p-4 shadow-sm backdrop-blur-md">
        <h1 className="text-center font-display text-2xl font-bold text-brand-700">{storeName}</h1>
        <p className="mt-1 text-center text-xs uppercase tracking-widest text-slate-500">Nosso cardapio digital</p>
      </header>

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

      <main className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
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
                <p className="line-clamp-1 text-xs text-slate-400">{product.description || 'Sabor irresistivel'}</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-brand-600">{formatBRL(getProductPrice(product.id))}</span>
                <button
                  onClick={() => addToCart(product)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 transition hover:bg-brand-600 hover:text-white"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ))}
      </main>

      {cart.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 rounded-t-[32px] border-t border-brand-100 bg-white p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
          <div className="mx-auto max-w-lg">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Itens no carrinho</p>
                <p className="text-xl font-bold text-slate-800">{formatBRL(total)}</p>
              </div>
              <button
                onClick={handleSendOrder}
                className="rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-8 py-3 font-bold text-white shadow-lg transition active:scale-95"
              >
                Enviar Pedido
              </button>
            </div>
            <div className="scrollbar-none flex gap-2 overflow-x-auto pb-2">
              {cart.map((item) => (
                <div
                  key={item.product.id}
                  className="relative flex shrink-0 items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2"
                >
                  <span className="text-xs font-bold text-brand-600">{item.qty}x</span>
                  <span className="max-w-[80px] truncate text-sm text-slate-600">{item.product.name}</span>
                  <button onClick={() => removeFromCart(item.product.id)} className="text-xs text-slate-300 hover:text-rose-500">
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default PublicMenu
