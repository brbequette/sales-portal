"use client"
import { useState, useEffect } from "react"
import { FiSave, FiSettings } from "react-icons/fi"

export default function AdminSettingsPage() {
  const [limit, setLimit] = useState("1")
  const [prompt, setPrompt] = useState("")
  const [zohoNumbers, setZohoNumbers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (data.success) {
        setLimit(data.settings.sms_daily_account_limit)
        setPrompt(data.settings.ai_reply_prompt)
      }

      const numRes = await fetch('/api/manage-zoho-numbers?action=list')
      const numData = await numRes.json()
      if (numData.success) {
        setZohoNumbers(numData.numbers || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sms_daily_account_limit: limit,
          ai_reply_prompt: prompt
        })
      })
      const data = await res.json()

      const numRes = await fetch('/api/manage-zoho-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers: zohoNumbers })
      })
      const numData = await numRes.json()

      if (data.success && numData.success) {
        alert('Settings saved successfully!')
      } else {
        alert('Error saving settings: ' + data.error)
      }
    } catch (e) {
      console.error(e)
      alert('Error saving settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <FiSettings className="text-3xl text-neutral-400" />
        <h1 className="text-2xl font-bold text-white">System Settings</h1>
      </div>

      {loading ? (
        <div className="text-neutral-400">Loading settings...</div>
      ) : (
        <div className="space-y-8">
          {/* Campaign Limits */}
          <div className="bg-neutral-900 rounded-xl border border-white/10 p-6">
            <h2 className="text-lg font-bold text-white mb-4">Campaign Limits</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">
                  Daily Blast Limit Per Account
                </label>
                <p className="text-xs text-neutral-500 mb-3">
                  The maximum number of times a single account can be targeted by a campaign blast in a 24-hour period. This prevents spam.
                </p>
                <input 
                  type="number"
                  value={limit}
                  onChange={e => setLimit(e.target.value)}
                  className="w-32 bg-[#0f1013] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* AI Settings */}
          <div className="bg-neutral-900 rounded-xl border border-white/10 p-6">
            <h2 className="text-lg font-bold text-white mb-4">AI Assistant Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">
                  Magic Reply System Prompt
                </label>
                <p className="text-xs text-neutral-500 mb-3">
                  Instructions for the AI when generating SMS reply suggestions. Tell it who it is, and what tone to use.
                </p>
                <textarea 
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  rows={6}
                  className="w-full bg-[#0f1013] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 resize-y"
                />
              </div>
            </div>
          </div>

          {/* Zoho Phone Numbers */}
          <div className="bg-neutral-900 rounded-xl border border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Zoho Phone Numbers</h2>
              <button 
                onClick={() => setZohoNumbers([...zohoNumbers, { number: "", name: "", isDefault: false, assignedUserIds: [] }])}
                className="text-xs font-bold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-white"
              >
                + Add Number
              </button>
            </div>
            <p className="text-xs text-neutral-500 mb-6">
              Manage the phone numbers used for SMS Campaigns. You can assign specific numbers to specific users, or set a default.
            </p>
            <div className="space-y-3">
              {zohoNumbers.map((num, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-[#0f1013] p-3 rounded-lg border border-white/5">
                  <div className="flex-1">
                    <input 
                      type="text"
                      placeholder="Phone Number (e.g. +18005550199)"
                      value={num.number}
                      onChange={(e) => {
                        const newNums = [...zohoNumbers]
                        newNums[i].number = e.target.value
                        setZohoNumbers(newNums)
                      }}
                      className="w-full bg-transparent border-b border-white/10 px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-500 mb-2"
                    />
                    <input 
                      type="text"
                      placeholder="Friendly Name (e.g. Main Line)"
                      value={num.name}
                      onChange={(e) => {
                        const newNums = [...zohoNumbers]
                        newNums[i].name = e.target.value
                        setZohoNumbers(newNums)
                      }}
                      className="w-full bg-transparent border-b border-white/10 px-2 py-1 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  
                  <div className="flex items-center gap-4 shrink-0">
                    <label className="flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                      <input 
                        type="radio"
                        name="default_zoho_number"
                        checked={num.isDefault}
                        onChange={() => {
                          const newNums = zohoNumbers.map((n, idx) => ({ ...n, isDefault: idx === i }))
                          setZohoNumbers(newNums)
                        }}
                        className="w-3 h-3 bg-neutral-800 border-white/10 text-emerald-500 focus:ring-emerald-500"
                      />
                      Default
                    </label>
                    <button
                      onClick={() => setZohoNumbers(zohoNumbers.filter((_, idx) => idx !== i))}
                      className="text-red-400 hover:text-red-300 p-1 rounded transition-colors"
                      title="Remove Number"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    </button>
                  </div>
                </div>
              ))}
              {zohoNumbers.length === 0 && (
                <div className="text-center py-6 border border-dashed border-white/10 rounded-lg text-neutral-500 text-sm">
                  No Zoho numbers added yet.
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button 
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiSave />}
              Save Settings
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
