"use client"

import { useState, useEffect } from "react"
import { FiSearch, FiGrid, FiShoppingCart, FiTrash2, FiEdit2, FiCheck, FiX, FiChevronDown } from "react-icons/fi"
import { useProductModal } from "./ProductModalProvider"
import { useZoho } from "./ZohoProvider"

type CartItem = {
  product: any
  quantity: number
  customPrice: number
  customMsrp: number
}

export function PointOfSale({ accountId, onCancel, onSuccess }: { accountId: string; onCancel: () => void; onSuccess?: () => void }) {
  const { showProduct } = useProductModal()
  const { zohoContext: currentUser } = useZoho()
  const [products, setProducts] = useState<any[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [type, setType] = useState<"Quote" | "SalesOrder">("Quote")
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState("All")
  const [editingPrice, setEditingPrice] = useState<string | null>(null)
  const [tempPrice, setTempPrice] = useState("")
  const [editingMsrp, setEditingMsrp] = useState<string | null>(null)
  const [tempMsrp, setTempMsrp] = useState("")
  const [mobileTab, setMobileTab] = useState<"catalog" | "cart">("catalog")
  const [users, setUsers] = useState<any[]>([])
  const [assigneeId, setAssigneeId] = useState("")
  const [processingNotes, setProcessingNotes] = useState("")
  const [syncing, setSyncing] = useState(false)

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/get-products")
      const data = await res.json()
      if (data.success) setProducts(data.products)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSyncWithZoho = async () => {
    setSyncing(true)
    try {
      let page = 1
      let hasMore = true
      while (hasMore) {
        const res = await fetch(`/api/get-products?reseed=true&page=${page}`)
        const data = await res.json()
        if (data.success) {
          hasMore = data.hasMore
          page = data.nextPage || (page + 1)
        } else {
          throw new Error(data.message || "Failed during reseed")
        }
      }
      await fetchProducts()
    } catch (e: any) {
      console.error(e)
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/get-update-config")
        const data = await res.json()
        if (data.success && data.users) {
          const visibleReps = data.config?.visibleReps || []
          const filteredUsers = data.users.filter((u: any) => 
            visibleReps.includes(u.id) || 
            u.role?.toLowerCase().includes("admin") || 
            u.role === "Administrator"
          )
          setUsers(filteredUsers)
          const currentRep = filteredUsers.find((u: any) => u.id === currentUser?.id || u.zohoId === currentUser?.id)
          if (currentRep) {
            setAssigneeId(currentRep.id)
          }
        }
      } catch (e) {
        console.error("Failed to fetch users:", e)
      }
    }
    fetchProducts()
    fetchUsers()
  }, [currentUser])

  const categories = ["All", ...Array.from(new Set(products.map((p) => p.category || "Uncategorized"))).sort()]

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description || "").toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesCategory = activeCategory === "All" || (p.category || "Uncategorized") === activeCategory
    
    let isActive = true
    if (p.description) {
      try {
        const parsed = JSON.parse(p.description)
        if (parsed.status === "inactive") isActive = false
      } catch(e) {}
    }
    
    return matchesSearch && matchesCategory && isActive
  })

  const addToCart = (product: any) => {
    const existing = cart.find((i) => i.product.id === product.id)
    if (existing) {
      setCart(cart.map((i) => (i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)))
    } else {
      setCart([...cart, { product, quantity: 1, customPrice: product.price, customMsrp: product.price }])
    }
  }

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((i) => i.product.id !== productId))
  }

  const adjustQuantity = (productId: string, delta: number) => {
    setCart(
      cart.map((i) => {
        if (i.product.id === productId) {
          const newQ = i.quantity + delta
          return newQ > 0 ? { ...i, quantity: newQ } : i
        }
        return i
      })
    )
  }

  const startEditPrice = (productId: string, currentPrice: number) => {
    setEditingPrice(productId)
    setTempPrice(currentPrice.toFixed(2))
  }

  const commitPrice = (productId: string) => {
    const parsed = parseFloat(tempPrice)
    if (!isNaN(parsed) && parsed >= 0) {
      setCart(cart.map((i) => (i.product.id === productId ? { ...i, customPrice: parsed } : i)))
    }
    setEditingPrice(null)
  }

  const startEditMsrp = (productId: string, currentMsrp: number) => {
    setEditingMsrp(productId)
    setTempMsrp(currentMsrp.toFixed(2))
  }

  const commitMsrp = (productId: string) => {
    const parsed = parseFloat(tempMsrp)
    if (!isNaN(parsed) && parsed >= 0) {
      setCart(cart.map((i) => (i.product.id === productId ? { ...i, customMsrp: parsed } : i)))
    }
    setEditingMsrp(null)
  }

  const subtotal = cart.reduce((sum, item) => sum + item.customPrice * item.quantity, 0)
  const total = subtotal

  const processOrder = async () => {
    if (cart.length === 0) return
    setIsProcessing(true)
    try {
      const itemsFormatted = cart.map(
        (i) =>
          `${i.quantity}x ${i.product.name} (${i.product.sku}) - $${i.customPrice.toFixed(2)} ea` +
          (i.customMsrp !== i.customPrice
            ? ` [Discounted from $${i.customMsrp.toFixed(2)}]`
            : "")
      )
      const totalDiscount = cart.reduce(
        (sum, i) => sum + (i.customMsrp - i.customPrice) * i.quantity,
        0
      )
      const res = await fetch("/api/create-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          type,
          amount: total,
          items: itemsFormatted,
          lineItems: cart.map((i) => {
            let itemId = null
            let itemDesc = ""
            if (i.product.description) {
              try {
                const parsed = JSON.parse(i.product.description)
                itemId = parsed.itemId || null
                itemDesc = parsed.text || ""
              } catch (e) {}
            }
            return {
              name: i.product.name,
              itemId: itemId,
              rate: i.customMsrp,
              discount: i.customMsrp > i.customPrice ? (i.customMsrp - i.customPrice) * i.quantity : 0,
              quantity: i.quantity,
              description: itemDesc || `SKU: ${i.product.sku}`
            }
          }),
          discountTotal: undefined,
          userId: currentUser?.id,
          userEmail: currentUser?.email,
          processingNotes: processingNotes.trim() || undefined,
          assigneeId: assigneeId || undefined
        }),
      })
      if (res.ok) {
        alert(`${type} created successfully!`)
        if (onSuccess) onSuccess()
        else onCancel()
      } else {
        const errorData = await res.json().catch(() => ({}))
        alert(`Failed to process order: ${errorData.error || errorData.message || res.statusText}`)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsProcessing(false)
    }
  }

  if (loading)
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
        <p className="animate-pulse text-white">Loading Catalog...</p>
      </div>
    )

  return (
    <div className="fixed inset-0 bg-neutral-950 z-50 flex flex-col overflow-hidden text-white safe-top safe-bottom">
      {/* Header */}
      <header className="flex-none bg-neutral-900 border-b border-neutral-800 px-4 sm:px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <FiShoppingCart className="text-blue-400 text-lg sm:text-xl" />
          <h2 className="text-sm sm:text-lg font-bold">Point of Sale</h2>
          <span className="text-xs text-neutral-500 hidden sm:inline">• {filteredProducts.length} items in catalog</span>
          <button
            onClick={handleSyncWithZoho}
            disabled={syncing}
            className="hidden sm:flex ml-2 items-center gap-1.5 px-2 py-1 text-[10px] font-bold rounded border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors disabled:opacity-50"
          >
            <svg className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3m-3-5v12" />
            </svg>
            <span>{syncing ? "Syncing..." : "Sync"}</span>
          </button>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="bg-neutral-800 border border-neutral-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
            value={type}
            onChange={(e) => setType(e.target.value as any)}
          >
            <option value="Quote">Quote</option>
            <option value="SalesOrder">Sales Order</option>
          </select>
          <button onClick={onCancel} className="text-neutral-400 hover:text-white transition-colors text-xs font-bold bg-neutral-800 px-3 py-1.5 rounded-lg border border-neutral-700 hover:bg-neutral-700">&times; Close</button>
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <div className="lg:hidden flex-none bg-neutral-900 border-b border-neutral-800 flex p-2 gap-2">
        <button
          onClick={() => setMobileTab("catalog")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg border text-center transition-all ${
            mobileTab === "catalog"
              ? "bg-blue-600 text-white border-blue-500"
              : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white"
          }`}
        >
          Catalog ({filteredProducts.length})
        </button>
        <button
          onClick={() => setMobileTab("cart")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg border text-center transition-all ${
            mobileTab === "cart"
              ? "bg-blue-600 text-white border-blue-500"
              : "bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white"
          }`}
        >
          Cart ({cart.reduce((s, i) => s + i.quantity, 0)})
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Catalog */}
        <div className={`flex-1 flex flex-col overflow-hidden border-r border-neutral-800 ${mobileTab === "cart" ? "hidden lg:flex" : "flex"}`}>
          {/* Search & Filter Bar */}
          <div className="flex-none p-4 bg-neutral-900/50 border-b border-neutral-800 space-y-3">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                placeholder="Search by name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500 text-white placeholder-neutral-600"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    activeCategory === cat
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  className="bg-neutral-800/60 border border-neutral-700 rounded-lg p-3 flex flex-col hover:border-blue-500/50 transition-colors group"
                >
                  <div className="text-[10px] text-neutral-500 mb-1 font-mono">{p.sku}</div>
                  <div className="text-xs text-blue-400 mb-1">{p.category}</div>
                  <div 
                    className="font-semibold text-white text-sm leading-tight mb-2 flex-1 line-clamp-2 cursor-pointer hover:underline hover:text-emerald-400 transition-colors"
                    onClick={() => showProduct(p.name, p)}
                  >
                    {p.name}
                  </div>
                  <div className="flex justify-between items-center mt-auto pt-2 border-t border-neutral-700">
                    <div className="text-sm sm:text-base font-bold text-emerald-400">${p.price.toFixed(2)}</div>
                    <button
                      onClick={() => addToCart(p)}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs font-bold transition-colors"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {filteredProducts.length === 0 && (
              <div className="text-center py-16 text-neutral-500">
                <FiGrid className="mx-auto text-4xl mb-3 text-neutral-700" />
                <p>No products match your search.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Cart */}
        <div className={`w-full lg:w-80 xl:w-96 bg-neutral-900 flex flex-col shrink-0 ${mobileTab === "catalog" ? "hidden lg:flex" : "flex"}`}>
          <div className="flex-none px-4 py-3 border-b border-neutral-800">
            <h3 className="text-sm font-bold text-white">
              Current Order <span className="text-neutral-500 font-normal">({cart.length} items)</span>
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {cart.length === 0 ? (
              <div className="p-8 text-center text-neutral-600">
                <FiShoppingCart className="mx-auto text-4xl mb-3" />
                <p className="text-sm">Cart is empty.<br />Add items from the catalog.</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-800">
                {cart.map((item) => {
                  const discounted = item.customPrice < item.customMsrp
                  return (
                    <div key={item.product.id} className="p-4 space-y-2">
                      {/* Product name + remove */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div 
                            className="text-sm font-semibold text-white truncate cursor-pointer hover:underline hover:text-emerald-400 transition-colors"
                            onClick={() => showProduct(item.product.name, item.product)}
                          >
                            {item.product.name}
                          </div>
                          <div className="text-xs text-neutral-500 font-mono">{item.product.sku}</div>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-neutral-600 hover:text-red-400 transition-colors mt-0.5"
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>

                      {/* Price edit rows */}
                      <div className="flex flex-col gap-2 mt-1 bg-neutral-800/30 p-2 rounded">
                        {/* MSRP Row */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-neutral-500 w-12">MSRP:</span>
                          {editingMsrp === item.product.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-neutral-400">$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={tempMsrp}
                                onChange={(e) => setTempMsrp(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && commitMsrp(item.product.id)}
                                className="w-20 bg-neutral-700 border border-red-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                                autoFocus
                              />
                              <button onClick={() => commitMsrp(item.product.id)} className="text-green-400 hover:text-green-300"><FiCheck size={14} /></button>
                              <button onClick={() => setEditingMsrp(null)} className="text-red-400 hover:text-red-300"><FiX size={14} /></button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditMsrp(item.product.id, item.customMsrp)}
                              className={`flex items-center gap-1 text-xs font-bold transition-colors ${discounted ? 'text-red-400 line-through' : 'text-neutral-400 hover:text-neutral-300'}`}
                            >
                              ${item.customMsrp.toFixed(2)}
                              <FiEdit2 size={10} className="text-neutral-500 no-underline" />
                            </button>
                          )}
                        </div>

                        {/* Sell Row */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-neutral-500 w-12">Sell:</span>
                          {editingPrice === item.product.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-neutral-400">$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={tempPrice}
                                onChange={(e) => setTempPrice(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && commitPrice(item.product.id)}
                                className="w-20 bg-neutral-700 border border-emerald-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
                                autoFocus
                              />
                              <button onClick={() => commitPrice(item.product.id)} className="text-green-400 hover:text-green-300"><FiCheck size={14} /></button>
                              <button onClick={() => setEditingPrice(null)} className="text-red-400 hover:text-red-300"><FiX size={14} /></button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditPrice(item.product.id, item.customPrice)}
                              className="flex items-center gap-1 text-sm font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
                            >
                              ${item.customPrice.toFixed(2)}
                              <FiEdit2 size={11} className="text-neutral-500" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Qty + line total */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center border border-neutral-700 rounded overflow-hidden">
                          <button
                            onClick={() => adjustQuantity(item.product.id, -1)}
                            className="px-2 py-0.5 text-neutral-300 hover:bg-neutral-700 text-sm transition-colors"
                          >−</button>
                          <span className="px-3 py-0.5 text-sm text-white border-x border-neutral-700">{item.quantity}</span>
                          <button
                            onClick={() => adjustQuantity(item.product.id, 1)}
                            className="px-2 py-0.5 text-neutral-300 hover:bg-neutral-700 text-sm transition-colors"
                          >+</button>
                        </div>
                        <span className="text-sm font-bold text-white">
                          ${(item.customPrice * item.quantity).toFixed(2)}
                        </span>
                      </div>

                      {discounted && (
                        <div className="text-[10px] text-amber-400 bg-amber-900/20 rounded px-2 py-0.5">
                          Saving ${((item.customMsrp - item.customPrice) * item.quantity).toFixed(2)} on this item
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            
            {/* Processing details form (Notes + Assignee) */}
            {cart.length > 0 && (
              <div className="p-4 border-t border-neutral-800 space-y-4 bg-neutral-950/40">
                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                    Assign Processing Task To
                  </label>
                  <div className="relative">
                    <select
                      value={assigneeId}
                      onChange={(e) => setAssigneeId(e.target.value)}
                      className="w-full bg-neutral-850 border border-neutral-700 rounded px-2.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer appearance-none pr-8"
                    >
                      <option value="">— Select Representative —</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email.split("@")[0]})
                        </option>
                      ))}
                    </select>
                    <FiChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                    Order Processing Notes
                  </label>
                  <textarea
                    value={processingNotes}
                    onChange={(e) => setProcessingNotes(e.target.value)}
                    placeholder="Enter processing notes (e.g. Rush processing needed, custom delivery instructions, priority item handling...)"
                    rows={3}
                    className="w-full bg-neutral-850 border border-neutral-700 rounded p-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 resize-none font-sans"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Totals + CTA */}
          <div className="flex-none border-t border-neutral-800 p-4 space-y-3">
            <div className="flex justify-between text-sm text-neutral-400">
              <span>Subtotal ({cart.reduce((s, i) => s + i.quantity, 0)} units)</span>
              <span className="text-white font-semibold">${subtotal.toFixed(2)}</span>
            </div>
            {cart.some((i) => i.customPrice < i.customMsrp) && (
              <div className="flex justify-between text-sm text-amber-400">
                <span>Total Discount</span>
                <span>
                  -${cart.reduce((s, i) => s + (i.customMsrp - i.customPrice) * i.quantity, 0).toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-white pt-2 border-t border-neutral-700">
              <span>Total</span>
              <span className="text-blue-400">${total.toFixed(2)}</span>
            </div>
            <button
              onClick={processOrder}
              disabled={cart.length === 0 || isProcessing}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isProcessing ? "Processing..." : `Create ${type}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
