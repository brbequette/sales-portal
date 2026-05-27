"use client"

import { useState, useEffect } from "react"

export function PointOfSale({ accountId, onCancel }: { accountId: string, onCancel: () => void }) {
  const [products, setProducts] = useState<any[]>([])
  const [cart, setCart] = useState<{product: any, quantity: number}[]>([])
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [type, setType] = useState<"Quote" | "SalesOrder">("Quote")

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await fetch('/api/get-products')
        const data = await res.json()
        if (data.success) setProducts(data.products)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchProducts()
  }, [])

  const addToCart = (product: any) => {
    const existing = cart.find(i => i.product.id === product.id)
    if (existing) {
      setCart(cart.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      setCart([...cart, { product, quantity: 1 }])
    }
  }

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(i => i.product.id !== productId))
  }

  const adjustQuantity = (productId: string, delta: number) => {
    setCart(cart.map(i => {
      if (i.product.id === productId) {
        const newQ = i.quantity + delta
        return newQ > 0 ? { ...i, quantity: newQ } : i
      }
      return i
    }))
  }

  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0)
  const tax = subtotal * 0.08 // 8% dummy tax
  const total = subtotal + tax

  const processOrder = async () => {
    if (cart.length === 0) return
    setIsProcessing(true)
    try {
      const itemsFormatted = cart.map(i => `${i.quantity}x ${i.product.name} (${i.product.sku}) - $${i.product.price} ea`)
      const res = await fetch('/api/create-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          type,
          amount: total,
          items: itemsFormatted
        })
      })
      if (res.ok) {
        alert(`${type} created successfully!`)
        onCancel() // Close the POS
      } else {
        alert("Failed to process order.")
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsProcessing(false)
    }
  }

  if (loading) return <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"><p className="animate-pulse text-white">Loading Catalog...</p></div>

  return (
    <div className="fixed inset-0 bg-(--background) z-50 flex flex-col overflow-hidden text-(--foreground)">
      <header className="flex-none bg-(--card) border-b border-(--border) p-4 flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <svg className="w-6 h-6 text-(--primary)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
          Point of Sale
        </h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-white px-4 py-2">&times; Close</button>
      </header>
      
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Catalog */}
        <div className="flex-1 overflow-y-auto p-6 border-r border-(--border) bg-black/20">
          <h3 className="text-lg font-bold mb-4 text-white">Product Catalog</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map(p => (
              <div key={p.id} className="bg-(--card) border border-(--border) p-4 rounded-lg shadow-lg hover:border-(--primary)/50 transition-colors flex flex-col">
                <div className="text-xs text-gray-500 mb-1">{p.sku} &bull; {p.category}</div>
                <div className="font-bold text-white mb-2">{p.name}</div>
                <div className="text-sm text-gray-400 mb-4 flex-1">{p.description}</div>
                <div className="flex justify-between items-center mt-auto pt-2 border-t border-(--border)">
                  <div className="text-lg font-bold text-blue-400">${p.price.toFixed(2)}</div>
                  <button onClick={() => addToCart(p)} className="bg-(--primary) hover:bg-(--primary)/80 text-white px-3 py-1 rounded text-sm font-medium">Add</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Cart */}
        <div className="w-full max-w-md bg-(--card)/50 p-6 flex flex-col border-l border-(--border)">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-lg font-bold text-white">Current Order</h3>
             <select 
               className="bg-black/50 border border-(--border) rounded p-1 text-sm text-white"
               value={type} onChange={e => setType(e.target.value as any)}
             >
               <option value="Quote">Quote</option>
               <option value="SalesOrder">Sales Order</option>
             </select>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-4 mb-6">
            {cart.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Cart is empty.</p>
            ) : (
              cart.map((item, i) => (
                <div key={i} className="flex items-center justify-between border-b border-(--border)/50 pb-2">
                  <div className="flex-1">
                    <div className="text-sm font-bold text-white">{item.product.name}</div>
                    <div className="text-xs text-gray-400">${item.product.price.toFixed(2)} each</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center border border-(--border) rounded">
                      <button onClick={() => adjustQuantity(item.product.id, -1)} className="px-2 hover:bg-white/10 text-gray-300">-</button>
                      <span className="px-2 text-sm text-white">{item.quantity}</span>
                      <button onClick={() => adjustQuantity(item.product.id, 1)} className="px-2 hover:bg-white/10 text-gray-300">+</button>
                    </div>
                    <button onClick={() => removeFromCart(item.product.id)} className="text-red-400 hover:text-red-300 text-xl leading-none">&times;</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-(--border) pt-4 space-y-2">
            <div className="flex justify-between text-sm text-gray-300">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-400">
              <span>Tax (8%)</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xl font-bold text-white pt-2 border-t border-(--border)/50">
              <span>Total</span>
              <span className="text-blue-400">${total.toFixed(2)}</span>
            </div>
            <button 
              onClick={processOrder}
              disabled={cart.length === 0 || isProcessing}
              className="w-full mt-4 bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg font-bold text-lg transition-colors disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : `Process ${type}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
