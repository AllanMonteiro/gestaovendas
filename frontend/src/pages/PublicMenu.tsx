import React, { useEffect, useState } from 'react'
import { api } from '../api/client'

type Product = {
  id: number
  name: string
  price: string
  description?: string
  image_url?: string | null
  category_id: number
}

type Category = {
  id: number
  name: string
}

const formatBRL = (val: string | number) => Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const PublicMenu: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [cart, setCart] = useState<{ product: Product; qty: number }[]>([])
  const [storeName, setStoreName] = useState('Nossa Sorveteria')
  const [storePhone, setStorePhone] = useState('')

  useEffect(() => {
    const load = async () => {
      const [cats, prods, config] = await Promise.all([
        api.get<Category[]>('/api/categories'),
        api.get<Product[]>('/api/products'),
        api.get<any>('/api/config')
      ])
      setCategories(cats.data)
      setProducts(prods.data)
      setStoreName(config.data.store_name || 'Nossa Sorveteria')
      setStorePhone(config.data.cnpj || '') // Usando CNPJ se nao tiver fone, mas o ideal seria ter fone.
      if (cats.data.length > 0) setSelectedCategoryId(cats.data[0].id)
    }
    void load()
  }, [])

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        return prev.map((i) => (i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i))
      }
      return [...prev, { product, qty: 1 }]
    })
  }

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId))
  }

  const total = cart.reduce((sum, item) => sum + Number(item.product.price) * item.qty, 0)

  const handleSendOrder = () => {
    if (cart.length === 0) return
    
    let message = `*NOVO PEDIDO - ${storeName}*\n\n`
    message += cart.map(i => `- ${i.qty}x ${i.product.name} (${formatBRL(i.product.price)})`).join('\n')
    message += `\n\n*TOTAL: ${formatBRL(total)}*`
    message += `\n\n*DADOS PARA ENTREGA:*\n`
    message += `Nome:\nEndereço:\nBairro:\nReferência:`
    
    const encoded = encodeURIComponent(message)
    const phone = storePhone.replace(/\D/g, '') || '55' // Fallback
    window.location.href = `https://wa.me/${phone}?text=${encoded}`
  }

  const filteredProducts = selectedCategoryId 
    ? products.filter(p => p.category_id === selectedCategoryId)
    : products

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      <header className="sticky top-0 z-30 bg-white/90 p-4 shadow-sm backdrop-blur-md">
        <h1 className="text-center font-display text-2xl font-bold text-brand-700">{storeName}</h1>
        <p className="text-center text-xs text-slate-500 uppercase tracking-widest mt-1">Nossa Cardapio Digital</p>
      </header>

      <nav className="sticky top-[68px] z-20 bg-white border-b border-brand-50 scrollbar-none flex gap-3 overflow-x-auto p-3">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategoryId(cat.id)}
            className={`shrink-0 rounded-full px-5 py-2 text-sm font-semibold transition ${
              selectedCategoryId === cat.id 
                ? 'bg-brand-600 text-white shadow-md' 
                : 'bg-brand-50 text-brand-700'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </nav>

      <main className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
        {filteredProducts.map(product => (
          <div key={product.id} className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm border border-brand-50">
            <div className="h-20 w-20 shrink-0 rounded-xl bg-slate-100">
               {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="h-full w-full rounded-xl object-cover" />
               ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl">🍦</div>
               )}
            </div>
            <div className="flex flex-1 flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-800">{product.name}</h3>
                <p className="text-xs text-slate-400 line-clamp-1">{product.description || 'Sabor irresistivel'}</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-brand-600">{formatBRL(product.price)}</span>
                <button 
                  onClick={() => addToCart(product)}
                  className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center hover:bg-brand-600 hover:text-white transition"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ))}
      </main>

      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] rounded-t-[32px] border-t border-brand-100">
          <div className="mx-auto max-w-lg">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Itens no carrinho</p>
                <p className="text-xl font-bold text-slate-800">{formatBRL(total)}</p>
              </div>
              <button 
                onClick={handleSendOrder}
                className="rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-8 py-3 font-bold text-white shadow-lg active:scale-95 transition"
              >
                Enviar Pedido
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {cart.map(item => (
                <div key={item.product.id} className="relative shrink-0 flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                  <span className="text-xs font-bold text-brand-600">{item.qty}x</span>
                  <span className="text-sm text-slate-600 max-w-[80px] truncate">{item.product.name}</span>
                  <button onClick={() => removeFromCart(item.product.id)} className="text-slate-300 hover:text-rose-500 text-xs">✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PublicMenu
