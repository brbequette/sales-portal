import re

with open('src/components/OrderBuilder.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Props
content = re.sub(
    r'  orderLines: OrderLine\[\]\n  setOrderLines: \(lines: OrderLine\[\] \| \(\(prev: OrderLine\[\]\) => OrderLine\[\]\)\) => void\n  catalogProducts: any\[\]',
    r'  orderLines?: OrderLine[]\n  setOrderLines?: (lines: OrderLine[] | ((prev: OrderLine[]) => OrderLine[])) => void\n  catalogProducts?: any[]',
    content
)

content = re.sub(
    r'  accent\?: "violet" \| "cyan" \| "emerald" \| "sky"\n\}',
    r'  accent?: "violet" | "cyan" | "emerald" | "sky"\n  accountId?: string\n  dealId?: string\n  onCancel?: () => void\n  onSuccess?: () => void\n}',
    content
)

# 2. Update Component Signature and State
new_sig = """export function OrderBuilder({
  orderLines: externalOrderLines,
  setOrderLines: externalSetOrderLines,
  catalogProducts: externalCatalogProducts,
  vigRate = 1.3,
  commissionPct = 50,
  accountName = "",
  accountDetail,
  accent = "violet",
  accountId,
  dealId,
  onCancel,
  onSuccess,
}: OrderBuilderProps) {
  const isControlled = externalSetOrderLines !== undefined
  const [internalOrderLines, setInternalOrderLines] = useState<OrderLine[]>(externalOrderLines || [])
  const [internalCatalogProducts, setInternalCatalogProducts] = useState<any[]>([])
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCalculator, setShowCalculator] = useState(false)

  const orderLines = isControlled ? (externalOrderLines as OrderLine[]) : internalOrderLines
  const setOrderLines = isControlled ? (externalSetOrderLines as any) : setInternalOrderLines
  const catalogProducts = externalCatalogProducts ?? internalCatalogProducts

  // Fetch catalog if missing
  useEffect(() => {
    if (!externalCatalogProducts) {
      setIsLoadingCatalog(true)
      fetch("/api/get-products")
        .then(r => r.json())
        .then(d => { if (d.success) setInternalCatalogProducts(d.products) })
        .catch(e => console.error("Failed to load catalog", e))
        .finally(() => setIsLoadingCatalog(false))
    }
  }, [externalCatalogProducts])

  // Submit order handler for standalone mode
  const handleConfirmOrder = async () => {
    if (!accountId) {
      // Not standalone, just close modal
      setShowMockOrder(false)
      return
    }
    
    setIsSubmitting(true)
    try {
      const paidLines = orderLines.filter(l => !l.isPromo)
      const orderTotal = paidLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
      
      const itemsFormatted = orderLines.map(
        (i) => f"{i.quantity}x {i.name} ({i.sku}) -  ea" + (i.isPromo ? " [PROMO FREE]" : "")
      )

      const lineItems = orderLines.map((i) => ({
        name: i.name,
        itemId: null,
        rate: i.unitPrice,
        discount: 0,
        quantity: i.quantity,
        description: f"SKU: {i.sku}" + (i.isPromo ? " (PROMO FREE)" : "")
      }))

      const res = await fetch("/api/create-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          dealId,
          type: "SalesOrder",
          amount: orderTotal,
          items: itemsFormatted,
          lineItems: lineItems,
          processingNotes: "Order created via Standalone OrderBuilder",
        }),
      })

      if (res.ok) {
        alert("SalesOrder created successfully!")
        if (onSuccess) onSuccess()
        setShowMockOrder(false)
        if (!externalOrderLines) setInternalOrderLines([])
      } else {
        const data = await res.json()
        alert(data.error || data.message || "Failed to create order")
      }
    } catch (e: any) {
      alert("Error: " + e.message)
    } finally {
      setIsSubmitting(false)
    }
  }
"""
new_sig = new_sig.replace('f"{i.quantity}x', '${i.quantity}x')
new_sig = new_sig.replace('{i.name} ({i.sku}) -  ea"', ' () - {i.unitPrice.toFixed(2)} ea')
new_sig = new_sig.replace('f"SKU: {i.sku}"', 'SKU: ')

content = re.sub(
    r'export function OrderBuilder\(\{\n  orderLines,\n  setOrderLines,\n  catalogProducts,\n  vigRate = 1\.3,\n  commissionPct = 50,\n  accountName = "",\n  accountDetail,\n  accent = "violet",\n\}: OrderBuilderProps\) \{',
    new_sig,
    content
)

# 3. Add Shipping State
shipping_state = """  // Pending Add Item State
  const [pendingItem, setPendingItem] = useState<{name: string, sku: string, cost: number, defaultPrice: number} | null>(null)
  const [addPaidQty, setAddPaidQty] = useState(1)
  const [addFreeQty, setAddFreeQty] = useState(0)
  const [addPrice, setAddPrice] = useState(0)

  // Shipping State
  const [showShipping, setShowShipping] = useState(false)
  const [shipZip, setShipZip] = useState("")
  const [shipWeight, setShipWeight] = useState("10")
  const [shipRates, setShipRates] = useState<any[]>([])
  const [isShippingLoading, setIsShippingLoading] = useState(false)
"""

content = re.sub(
    r'  // Pending Add Item State\n  const \[pendingItem, setPendingItem\] = useState<\{name: string, sku: string, cost: number, defaultPrice: number\} \| null>\(null\)\n  const \[addPaidQty, setAddPaidQty\] = useState\(1\)\n  const \[addFreeQty, setAddFreeQty\] = useState\(0\)\n  const \[addPrice, setAddPrice\] = useState\(0\)',
    shipping_state,
    content
)

# 4. Add Shipping Logic
shipping_logic = """  const removeLine = (id: string) =>
    setOrderLines(prev => prev.filter(l => l.id !== id))

  const handleEstimateShipping = async () => {
    setIsShippingLoading(true)
    try {
      const res = await fetch("/api/shipping/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zip: shipZip, weight: shipWeight })
      })
      const data = await res.json()
      setShipRates(data.rates || [])
    } catch (e) {
      console.error(e)
    } finally {
      setIsShippingLoading(false)
    }
  }

  const handleAddShippingLine = (rate: any) => {
    setOrderLines(prev => [
      ...prev,
      {
        id: Date.now().toString() + "-shipping",
        name: Shipping — ,
        sku: "SHIPPING",
        quantity: 1,
        unitPrice: rate.cost,
        cost: rate.cost,
        isPromo: false
      }
    ])
    setShowShipping(false)
    setShipRates([])
  }

  const paidLines  = orderLines.filter(l => !l.isPromo)"""
shipping_logic = shipping_logic.replace('Shipping — ', 'Shipping — ')
  
content = re.sub(
    r'  const removeLine = \(id: string\) =>\n    setOrderLines\(prev => prev\.filter\(l => l\.id !== id\)\)\n\n  const paidLines  = orderLines\.filter\(l => !l\.isPromo\)',
    shipping_logic,
    content
)

# 5. Add Shipping UI
shipping_ui = """      {/* -- Empty State ---------------------------------------------------- */}
      {orderLines.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-neutral-600">
          <FiShoppingCart size={22} />
          <p className="text-[10px] italic">Use Blade Lookup, search, or quick-add to start building the order</p>
        </div>
      )}

      {/* -- Shipping Estimate ---------------------------------------------- */}
      {orderLines.length > 0 && (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden mt-2">
          <button
            type="button"
            onClick={() => setShowShipping(!showShipping)}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5"><FiPackage size={11} /> Calculate Shipping</span>
            <FiChevronDown className={	ransition-transform duration-200 } />
          </button>
          
          {showShipping && (
            <div className="p-3 border-t border-neutral-800 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] font-bold text-neutral-500 uppercase">Dest Zip Code</label>
                  <input 
                    type="text" 
                    value={shipZip} 
                    onChange={e => setShipZip(e.target.value)} 
                    placeholder="e.g. 90210"
                    className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-violet-500 mt-0.5" 
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-neutral-500 uppercase">Weight (lbs)</label>
                  <input 
                    type="number" 
                    value={shipWeight} 
                    onChange={e => setShipWeight(e.target.value)} 
                    className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-violet-500 mt-0.5" 
                  />
                </div>
              </div>
              
              <button 
                type="button"
                onClick={handleEstimateShipping}
                disabled={!shipZip || isShippingLoading}
                className="w-full py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-[10px] font-black uppercase tracking-wider rounded transition-colors disabled:opacity-50"
              >
                {isShippingLoading ? "Calculating..." : "Get Rates"}
              </button>
              
              {shipRates.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-neutral-800">
                  <p className="text-[9px] font-bold text-neutral-500 uppercase">Available Rates</p>
                  {shipRates.map((rate, i) => (
                    <div key={i} className="flex items-center justify-between bg-neutral-950 border border-neutral-800 rounded p-2">
                      <span className="text-[11px] font-bold text-white">{rate.service}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono font-bold text-amber-400"></span>
                        <button 
                          type="button"
                          onClick={() => handleAddShippingLine(rate)}
                          className="px-2 py-1 bg-violet-600 hover:bg-violet-500 text-white text-[9px] font-black rounded transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* -- Order Summary -------------------------------------------------- */}"""
shipping_ui = shipping_ui.replace('', '')

content = re.sub(
    r'      \{/\* -- Empty State ---------------------------------------------------- \*/\}\n      \{orderLines\.length === 0 && \(\n        <div className="flex flex-col items-center justify-center gap-2 py-6 text-neutral-600">\n          <FiShoppingCart size=\{22\} />\n          <p className="text-\[10px\] italic">Use Blade Lookup, search, or quick-add to start building the order</p>\n        </div>\n      \)\}\n\n      \{/\* -- Order Summary -------------------------------------------------- \*/\}',
    shipping_ui,
    content
)

# 6. Replace confirm button
confirm_button = """              <button type="button" onClick={() => setShowMockOrder(false)} className="flex-1 py-2 rounded-lg bg-neutral-800 text-neutral-400 text-xs font-bold hover:bg-neutral-700 transition-colors cursor-pointer">
                Edit Order
              </button>
              <button 
                type="button" 
                onClick={handleConfirmOrder} 
                disabled={isSubmitting}
                className="flex-1 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-black hover:from-violet-500 hover:to-purple-500 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? "Processing..." : (accountId ? "Confirm & Submit Order" : "Close Preview")}
              </button>
            </div>"""

content = re.sub(
    r'              <button type="button" onClick=\{\(\) => setShowMockOrder\(false\)\} className="flex-1 py-2 rounded-lg bg-neutral-800 text-neutral-400 text-xs font-bold hover:bg-neutral-700 transition-colors cursor-pointer">\n                Edit Order\n              </button>\n              <button type="button" onClick=\{\(\) => setShowMockOrder\(false\)\} className="flex-1 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-black hover:from-violet-500 hover:to-purple-500 transition-all cursor-pointer">\n                Confirm Order\n              </button>\n            </div>',
    confirm_button,
    content
)

with open('src/components/OrderBuilder.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
