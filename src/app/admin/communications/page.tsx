"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { FiTrash2, FiPlus, FiSave, FiStar, FiUpload } from "react-icons/fi"

export default function AdminCommunicationsPage() {
  const router = useRouter()
  const [numbers, setNumbers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) return
      
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
      const newNumbers: any[] = []
      
      lines.forEach((line, i) => {
        // Skip header row if it contains 'number' or 'phone'
        const lowerLine = line.toLowerCase()
        if (i === 0 && (lowerLine.includes('number') || lowerLine.includes('phone'))) return
        
        const parts = line.split(',')
        if (parts.length > 0) {
          const num = parts[0].replace(/"/g, '').trim()
          const label = parts.length > 1 ? parts[1].replace(/"/g, '').trim() : 'Imported Line'
          if (num) {
             newNumbers.push({ number: num, label: label, isDefault: false })
          }
        }
      })

      if (newNumbers.length > 0) {
        setNumbers(prev => {
          const merged = [...prev, ...newNumbers]
          if (merged.length > 0 && !merged.find(n => n.isDefault)) {
            merged[0].isDefault = true
          }
          return merged
        })
        alert(`Imported ${newNumbers.length} numbers! Don't forget to save.`)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  useEffect(() => {
    fetch('/api/manage-zoho-numbers')
      .then(res => res.json())
      .then(data => {
        if (data.success) setNumbers(data.numbers || [])
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/manage-zoho-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers })
      })
      if (res.ok) alert("Saved successfully!")
      else alert("Failed to save.")
    } catch (e: any) {
      alert("Error: " + e.message)
    } finally {
      setSaving(false)
    }
  }

  const addNumber = () => {
    setNumbers([...numbers, { number: '', label: '', isDefault: numbers.length === 0 }])
  }

  const updateNumber = (index: number, field: string, value: any) => {
    const newNums = [...numbers]
    newNums[index][field] = value
    setNumbers(newNums)
  }

  const setAsDefault = (index: number) => {
    const newNums = numbers.map((n, i) => ({ ...n, isDefault: i === index }))
    setNumbers(newNums)
  }

  const deleteNumber = (index: number) => {
    const newNums = numbers.filter((_, i) => i !== index)
    if (newNums.length > 0 && !newNums.find(n => n.isDefault)) {
      newNums[0].isDefault = true
    }
    setNumbers(newNums)
  }

  if (loading) return <div className="p-8 text-neutral-400">Loading...</div>

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200 pb-20">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tight">Communication Numbers</h1>
            <p className="text-neutral-500 text-sm mt-1">Manage outbound phone numbers for SMS and Voice calls.</p>
          </div>
          <button 
            onClick={() => router.push('/admin')}
            className="px-4 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm hover:bg-neutral-800 transition"
          >
            &larr; Back to Admin
          </button>
        </header>

        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6 backdrop-blur-md">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-white">Outbound Numbers</h2>
            <div className="flex gap-2">
              <input 
                type="file" 
                accept=".csv" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
              />
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 bg-sky-600/20 text-sky-400 border border-sky-500/30 rounded-lg text-sm font-bold hover:bg-sky-600/30 transition">
                <FiUpload /> Import CSV
              </button>
              <button onClick={addNumber} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-bold hover:bg-emerald-600/30 transition">
                <FiPlus /> Add Number
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {numbers.length === 0 && (
              <div className="text-center py-8 text-neutral-500 bg-black/50 rounded-lg border border-neutral-800 border-dashed">
                No outbound numbers configured.
              </div>
            )}
            
            {numbers.map((num, i) => (
              <div key={i} className={`flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 rounded-lg border ${num.isDefault ? 'bg-emerald-900/10 border-emerald-500/30' : 'bg-black/50 border-neutral-800'}`}>
                <div className="flex-1">
                  <label className="text-xs text-neutral-500 block mb-1">Phone Number (e.g., +1234567890)</label>
                  <input 
                    value={num.number}
                    onChange={e => updateNumber(i, 'number', e.target.value)}
                    placeholder="+1..."
                    className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-neutral-500 block mb-1">Label / Description</label>
                  <input 
                    value={num.label}
                    onChange={e => updateNumber(i, 'label', e.target.value)}
                    placeholder="Main Sales Line"
                    className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 pt-4 sm:pt-6">
                  <button 
                    onClick={() => setAsDefault(i)}
                    className={`flex items-center gap-1 px-3 py-2 rounded text-xs font-bold transition ${num.isDefault ? 'bg-emerald-500/20 text-emerald-400' : 'text-neutral-400 hover:bg-neutral-800'}`}
                    title="Set as Default"
                  >
                    <FiStar className={num.isDefault ? 'fill-emerald-400' : ''} /> {num.isDefault ? 'Default' : 'Make Default'}
                  </button>
                  <button 
                    onClick={() => deleteNumber(i)}
                    className="p-2 text-red-400 hover:bg-red-500/20 rounded transition"
                    title="Delete"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-end border-t border-neutral-800 pt-6">
            <button 
              onClick={handleSave} 
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition disabled:opacity-50"
            >
              <FiSave /> {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
