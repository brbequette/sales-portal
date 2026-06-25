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
