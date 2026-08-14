"use client"


import { useState, useEffect } from "react"
import { FiX, FiSearch, FiDollarSign, FiPlus, FiAlertCircle, FiCheck } from "react-icons/fi"

export type Product = {
  id: string
  sku: string
  name: string
  price: number
  stock: number
  subjectToVig: boolean
  description: string | null
}

export interface PricingCalculatorProps {
  onClose: () => void
  onAddLineItem: (item: any) => void
}

export default function PricingCalculator({ onClose, onAddLineItem }: PricingCalculatorProps) {
  const [search, setSearch] = useState("")
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  
  // Settings
  const [settings, setSettings] = useState({
    default_vig_rate: 1.3,
    cc_fee_rate: 4.5,
    shipping_multiplier: 1.5,
  })

  // Calculation Inputs
  const [cost, setCost] = useState<number>(0)
  const [vigMultiplier, setVigMultiplier] = useState<number>(1.0)
  const [shippingCost, setShippingCost] = useState<number>(0)
  const [ccFeeRate, setCcFeeRate] = useState<number>(4.5)
  const [quantity, setQuantity] = useState<number>(1)

  useEffect(() => {
    // Fetch settings
    fetch('/api/admin/business-defaults')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.defaults) {
          setSettings({
            default_vig_rate: data.defaults.defaultVigRate,
            cc_fee_rate: data.defaults.ccFeeRate,
            shipping_multiplier: data.defaults.shippingMultiplier,
          })
          setCcFeeRate(data.defaults.ccFeeRate)
        }
      })
      .catch(err => console.error("Error fetching settings", err))
  }, [])

  useEffect(() => {
    // Debounced search
    const timer = setTimeout(() => {
      fetch(`/api/products?q=${encodeURIComponent(search)}`)
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setProducts(data.products)
          }
        })
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (selectedProduct) {
      setCost(selectedProduct.price || 0)
      setVigMultiplier(selectedProduct.subjectToVig ? settings.default_vig_rate : 1.0)
      setShippingCost(0)
    }
  }, [selectedProduct, settings])

  const safeCcFeeRate = ccFeeRate >= 100 ? 99 : ccFeeRate
  const recommendedPrice = ((cost * vigMultiplier) + shippingCost) / (1 - (safeCcFeeRate / 100))
  const totalPrice = recommendedPrice * quantity

  const handleAdd = () => {
    if (!selectedProduct) return
    onAddLineItem({
      id: Math.random().toString(36).substring(7),
      name: selectedProduct.name,
      sku: selectedProduct.sku,
      quantity,
      unitPrice: Number(recommendedPrice.toFixed(2)),
      cost: selectedProduct.price,
      isPromo: false,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 animate-in fade-in">
      <div className="w-full max-w-2xl rounded-xl border border-white/10 glass-panel shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h2 className="text-xl font-bold text-neutral-100 flex items-center gap-2">
            <FiCheck className="text-emerald-500" /> Pricing Calculator
          </h2>
          <button onClick={onClose} className="rounded p-2 text-neutral-400 hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 hover:text-white transition-colors">
            <FiX className="text-xl" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
          {/* Left panel: Product Search */}
          <div className="w-full md:w-1/2 border-b md:border-b-0 md:border-r border-white/10 p-4 flex flex-col gap-4 overflow-hidden">
            <div>
              <label className="text-xs font-black tracking-wider text-neutral-400 uppercase mb-2 block">
                Search Product
              </label>
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  placeholder="SKU or Name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black/20 py-2 pl-10 pr-4 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-2">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className={`w-full flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                    selectedProduct?.id === p.id 
                      ? 'border-emerald-500/50 bg-emerald-500/10' 
                      : 'border-white/10 bg-black/20 hover:border-neutral-700'
                  }`}
                >
                  <div className="font-medium text-sm text-neutral-200 line-clamp-1">{p.name}</div>
                  <div className="flex items-center justify-between w-full text-xs text-neutral-500">
                    <span>{p.sku}</span>
                    <span className="font-mono text-emerald-400">${p.price.toFixed(2)}</span>
                  </div>
                </button>
              ))}
              {products.length === 0 && search && (
                <div className="text-sm text-neutral-500 text-center py-4">
                  No products found.
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Calculator */}
          <div className="w-full md:w-1/2 p-4 flex flex-col gap-6 overflow-y-auto">
            {selectedProduct ? (
              <>
                <div className="bg-black/20 rounded-lg p-4 border border-white/10 shrink-0">
                  <div className="text-xs font-black tracking-wider text-neutral-400 uppercase mb-1">
                    Selected Product
                  </div>
                  <div className="font-medium text-neutral-200">{selectedProduct.name}</div>
                  <div className="text-xs text-neutral-500 mt-1">SKU: {selectedProduct.sku}</div>
                </div>

                <div className="grid grid-cols-2 gap-4 shrink-0">
                  <div>
                    <label className="text-xs font-black tracking-wider text-neutral-400 uppercase mb-2 block">
                      Cost (MSRP)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
                      <input
                        type="number"
                        value={cost}
                        onChange={(e) => setCost(Number(e.target.value))}
                        className="w-full rounded-lg border border-white/10 bg-black/20 py-2 pl-8 pr-4 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-black tracking-wider text-neutral-400 uppercase mb-2 flex items-center gap-1">
                      VIG Multiplier
                      {!selectedProduct.subjectToVig && (
                        <FiAlertCircle className="text-amber-500" title="Product not subject to VIG by default" />
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={vigMultiplier}
                      onChange={(e) => setVigMultiplier(Number(e.target.value))}
                      className="w-full rounded-lg border border-white/10 bg-black/20 py-2 px-4 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-black tracking-wider text-neutral-400 uppercase mb-2 block">
                      Shipping Cost
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
                      <input
                        type="number"
                        value={shippingCost}
                        onChange={(e) => setShippingCost(Number(e.target.value))}
                        className="w-full rounded-lg border border-white/10 bg-black/20 py-2 pl-8 pr-4 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-black tracking-wider text-neutral-400 uppercase mb-2 block">
                      CC Fee Rate (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        value={ccFeeRate}
                        onChange={(e) => setCcFeeRate(Number(e.target.value))}
                        className="w-full rounded-lg border border-white/10 bg-black/20 py-2 pl-4 pr-8 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">%</span>
                    </div>
                  </div>
                  
                  <div className="col-span-2">
                    <label className="text-xs font-black tracking-wider text-neutral-400 uppercase mb-2 block">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="w-full rounded-lg border border-white/10 bg-black/20 py-2 px-4 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-auto border-t border-white/10 pt-4 shrink-0">
                  <div className="flex justify-between items-end mb-4">
                    <div>
                      <div className="text-xs font-medium text-neutral-500">Unit Sale Price</div>
                      <div className="text-2xl font-black text-emerald-400">
                        ${recommendedPrice > 0 ? recommendedPrice.toFixed(2) : "0.00"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium text-neutral-500">Total Price</div>
                      <div className="text-lg font-bold text-neutral-200">
                        ${totalPrice > 0 ? totalPrice.toFixed(2) : "0.00"}
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleAdd}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-3 font-bold text-white transition-colors"
                  >
                    <FiPlus /> Add to Order
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 h-full">
                <FiCheck className="text-4xl mb-4 opacity-50" />
                <p>Select a product to calculate pricing.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

