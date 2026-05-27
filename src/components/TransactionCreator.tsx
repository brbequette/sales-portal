"use client"

import { useState } from "react"

export function TransactionCreator({ accountId }: { accountId: string }) {
  const [type, setType] = useState<"Quote" | "SalesOrder">("Quote")
  const [amount, setAmount] = useState("")
  const [items, setItems] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/create-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          type,
          amount: parseFloat(amount),
          items: items.split(',').map(i => i.trim())
        })
      })
      if (response.ok) {
        setAmount("")
        setItems("")
        alert(`${type} saved successfully!`)
      } else {
        alert("Failed to save transaction.")
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="p-4 bg-black/20 border border-(--border) rounded-lg space-y-4">
      <h3 className="font-semibold text-white flex items-center gap-2">
        <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
        Create New Transaction
      </h3>
      
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="radio" value="Quote" checked={type === "Quote"} onChange={() => setType("Quote")} />
          Quote
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="radio" value="SalesOrder" checked={type === "SalesOrder"} onChange={() => setType("SalesOrder")} />
          Sales Order
        </label>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold mb-1 block text-gray-300">Estimated Amount ($)</label>
          <input 
            type="number" 
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full bg-black/40 border border-(--border) rounded p-2 text-sm focus:outline-none focus:border-green-500"
            placeholder="e.g. 5000"
          />
        </div>
        <div>
          <label className="text-xs font-semibold mb-1 block text-gray-300">Line Items (comma separated)</label>
          <input 
            type="text" 
            value={items}
            onChange={e => setItems(e.target.value)}
            className="w-full bg-black/40 border border-(--border) rounded p-2 text-sm focus:outline-none focus:border-green-500"
            placeholder="e.g. 10x Widget A, 5x Widget B"
          />
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving || !amount}
          className="w-full bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : `Save ${type}`}
        </button>
      </div>
    </div>
  )
}
