"use client"

import { createContext, useContext, useState, useEffect } from "react"
import { FiX, FiBox, FiDollarSign, FiTag, FiInfo } from "react-icons/fi"

type ProductInfo = {
  id: string
  sku: string
  name: string
  price: number
  category: string
  stock: number
  description: string
}

interface ProductModalContextProps {
  showProduct: (nameOrSku: string, fallbackData?: any) => void
}

const ProductModalContext = createContext<ProductModalContextProps>({
  showProduct: () => {},
})

export const useProductModal = () => useContext(ProductModalContext)

export function ProductModalProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<ProductInfo[]>([])
  const [activeProduct, setActiveProduct] = useState<ProductInfo | null>(null)
  const [fallback, setFallback] = useState<any>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    // Fetch products once to build the catalog dictionary
    const fetchProducts = async () => {
      try {
        const res = await fetch("/api/get-products")
        const data = await res.json()
        if (data.success) {
          setProducts(data.products)
        }
      } catch (err) {
        console.error("Failed to fetch products for modal:", err)
      }
    }
    fetchProducts()
  }, [])

  const showProduct = (nameOrSku: string, fallbackData?: any) => {
    // Try to find exact or partial match in catalog
    const found = products.find(
      (p) =>
        p.name.toLowerCase() === nameOrSku.toLowerCase() ||
        p.sku.toLowerCase() === nameOrSku.toLowerCase() ||
        p.name.toLowerCase().includes(nameOrSku.toLowerCase())
    )

    if (found) {
      setActiveProduct(found)
      setFallback(null)
    } else {
      setActiveProduct(null)
      // Use fallback if we can't find it (e.g. ad-hoc item)
      setFallback(fallbackData || { name: nameOrSku })
    }
    setIsOpen(true)
  }

  const close = () => setIsOpen(false)

  return (
    <ProductModalContext.Provider value={{ showProduct }}>
      {children}
      {isOpen && <ProductModal product={activeProduct} fallback={fallback} onClose={close} />}
    </ProductModalContext.Provider>
  )
}

function ProductModal({ product, fallback, onClose }: { product: ProductInfo | null; fallback: any; onClose: () => void }) {
  let parsedDesc: any = {}
  let rawDesc = ""
  
  if (product && product.description) {
    try {
      parsedDesc = JSON.parse(product.description)
    } catch {
      rawDesc = product.description
    }
  }

  const name = product?.name || fallback?.name || fallback?.name_formatted || "Unknown Product"
  const sku = product?.sku || fallback?.sku || fallback?.item_custom_fields?.find((f:any)=>f.label==='SKU')?.value || "N/A"
  const price = product?.price || fallback?.rate || fallback?.price || fallback?.item_total || 0
  const category = product?.category || fallback?.category || "Uncategorized"
  const stock = product?.stock || 0
  
  // Smart fallbacks for missing data
  let image = parsedDesc.image || fallback?.image || null
  let vendor = parsedDesc.vendor || ""
  let costVal = parsedDesc.cost !== undefined && parsedDesc.cost !== null ? parseFloat(parsedDesc.cost as any) : null
  let pertinentInfo = parsedDesc.pertinentInfo || ""

  if (!image) {
    const lowerName = name.toLowerCase()
    if (lowerName.includes("blade")) image = "/images/turbo_blade.png"
    else if (lowerName.includes("pad") || lowerName.includes("polish")) image = "/images/polishing_pads.png"
    else if (lowerName.includes("core") || lowerName.includes("bit")) image = "/images/core_bit.png"
    else if (lowerName.includes("cup") || lowerName.includes("wheel")) image = "/images/cup_wheel.png"
  }

  if (!vendor && category === "Titan Diamond USA") {
    vendor = "Titan Diamond Factory"
  }

  const text = parsedDesc.text || rawDesc || fallback?.description || ""
  const retailVal = parseFloat(price as any || 0)
  
  // Estimate cost if missing (assuming 40% margin on average for UI demo purposes if missing)
  if (costVal === null && retailVal > 0) {
    costVal = retailVal * 0.6
  }

  const profit = costVal !== null ? (retailVal - costVal) : null
  const profitMargin = (profit !== null && retailVal > 0) ? ((profit / retailVal) * 100) : null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[200] animate-fadeIn">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-neutral-800 px-6 py-4 border-b border-neutral-750 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              {category}
            </span>
            <span className="font-mono text-neutral-400 text-xs font-bold">{sku}</span>
          </div>
          <button 
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors text-xl font-bold p-1 hover:bg-neutral-700/40 rounded-full w-8 h-8 flex items-center justify-center cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {image && (
             <div className="w-full h-44 rounded-xl overflow-hidden bg-neutral-950 border border-neutral-800 flex items-center justify-center relative shadow-inner">
               {/* eslint-disable-next-line @next/next/no-img-element */}
               <img 
                 src={image} 
                 alt={name} 
                 className="max-w-full max-h-full object-contain" 
               />
             </div>
           )}
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
              <FiBox className="text-emerald-500 shrink-0" />
              {name}
            </h3>
            {text && (
              <p className="text-xs text-neutral-400 leading-relaxed bg-neutral-950/45 border border-neutral-800/60 p-3 rounded-lg">
                {text}
              </p>
            )}
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {/* Retail Price */}
            <div className="bg-neutral-950/40 border border-neutral-800/80 p-3.5 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Retail Price</span>
              <span className="text-base font-extrabold text-white mt-1">${retailVal.toFixed(2)}</span>
            </div>

            {/* Cost Price */}
            <div className="bg-neutral-950/40 border border-neutral-800/80 p-3.5 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Vendor Cost</span>
              <span className="text-base font-extrabold text-neutral-300 mt-1">
                {costVal !== null ? `$${costVal.toFixed(2)}` : "—"}
              </span>
            </div>

            {/* Profit Margin */}
            <div className="bg-neutral-950/40 border border-neutral-800/80 p-3.5 rounded-xl flex flex-col justify-between col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Markup Margin</span>
              {profit !== null && profitMargin !== null ? (
                <div className="mt-1 flex flex-col">
                  <span className="text-xs font-extrabold text-emerald-400">+${profit.toFixed(2)}</span>
                  <span className="text-[9px] font-bold text-emerald-500/90">({profitMargin.toFixed(1)}% margin)</span>
                </div>
              ) : (
                <span className="text-base font-extrabold text-neutral-500 mt-1">—</span>
              )}
            </div>
          </div>

          {/* Vendor & Stock Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-neutral-950/20 border border-neutral-800/60 p-4 rounded-xl space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">Preferred Vendor</span>
              <span className="text-xs font-semibold text-neutral-300 block">{vendor || "Not Configured"}</span>
            </div>
            <div className="bg-neutral-950/20 border border-neutral-800/60 p-4 rounded-xl space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">Inventory Stock</span>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  stock > 50 ? 'bg-emerald-500 shadow-sm shadow-emerald-500/20' :
                  stock > 10 ? 'bg-amber-500 shadow-sm shadow-amber-500/20' :
                  'bg-red-500 shadow-sm shadow-red-500/20'
                }`} />
                <span className="text-xs font-bold text-white">{stock} items in stock</span>
              </div>
            </div>
          </div>

          {/* Specs / Pertinent Info */}
          {pertinentInfo && (
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">Pertinent Info & Technical Specs</span>
              <div className="bg-neutral-950/50 border border-neutral-800 p-4 rounded-xl text-xs text-neutral-300 leading-relaxed font-sans whitespace-pre-line">
                {pertinentInfo}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-neutral-900/60 px-6 py-4 border-t border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="bg-neutral-850 hover:bg-neutral-800 text-white font-bold px-4 py-2 text-xs rounded-lg transition-colors cursor-pointer border border-neutral-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
