"use client"
import { useState, useEffect } from "react"
import { FiSave, FiSettings, FiDollarSign, FiMessageSquare, FiTruck, FiTool } from "react-icons/fi"

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<'financial'|'communications'|'shipping'|'developer'>('financial')
  const [settings, setSettings] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Test Notification state
  const [users, setUsers] = useState<any[]>([])
  const [testUserId, setTestUserId] = useState("")
  const [testTitle, setTestTitle] = useState("Test Notification")
  const [testBody, setTestBody] = useState("This is a cross-device test notification from the admin panel.")
  const [sendingPush, setSendingPush] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/settings')
      const data = await res.json()
      if (data.success) {
        setSettings(data.settings)
      }

      const usersRes = await fetch('/api/get-users')
      const usersData = await usersRes.json()
      if (usersData.users) {
        setUsers(usersData.users)
        if (usersData.users.length > 0) {
          setTestUserId(usersData.users[0].id)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateSetting = (key: string, value: any) => {
    setSettings((prev: any) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      const data = await res.json()

      if (data.success) {
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

  const handleSendTestNotification = async () => {
    if (!testUserId) return alert("Please select a user")
    if (!testTitle || !testBody) return alert("Please enter title and body")

    try {
      setSendingPush(true)
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: testUserId,
          title: testTitle,
          body: testBody,
          url: "/?tab=dashboard"
        })
      })
      const data = await res.json()
      if (data.success) {
        if (data.warning) {
          alert("⚠️ " + data.warning)
        } else {
          alert(`✅ Test notification sent to ${data.subscriptionsSent} device(s)!`)
        }
      } else {
        alert("Error sending notification: " + data.error)
      }
    } catch (e) {
      console.error(e)
      alert("Error sending notification.")
    } finally {
      setSendingPush(false)
    }
  }

  return (
    <div className="flex flex-col text-neutral-100 font-sans h-full">
      <header className="px-6 py-5 border-b border-neutral-800 flex justify-between items-center shrink-0">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <FiSettings className="text-neutral-400" /> System Settings
        </h1>
        <button 
          onClick={handleSave}
          disabled={saving || loading}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiSave />}
          Save Changes
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Rail Navigation */}
        <div className="w-64 border-r border-neutral-800 bg-neutral-950 flex flex-col p-4 gap-2 overflow-y-auto shrink-0">
          <button 
            onClick={() => setActiveTab('financial')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${activeTab === 'financial' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent'}`}
          >
            <FiDollarSign /> Financial & Commissions
          </button>
          
          <button 
            onClick={() => setActiveTab('communications')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${activeTab === 'communications' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' : 'text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent'}`}
          >
            <FiMessageSquare /> AI & Communications
          </button>
          
          <button 
            onClick={() => setActiveTab('shipping')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${activeTab === 'shipping' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent'}`}
          >
            <FiTruck /> Shipping & Logistics
          </button>

          <button 
            onClick={() => setActiveTab('developer')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${activeTab === 'developer' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30' : 'text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent'}`}
          >
            <FiTool /> Developer Tools
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 bg-[#0a0a0a]">
          {loading ? (
            <div className="flex items-center gap-3 text-neutral-400 font-bold">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              Loading settings...
            </div>
          ) : (
            <div className="max-w-3xl space-y-8 pb-10">
              
              {/* FINANCIAL TAB */}
              {activeTab === 'financial' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <h2 className="text-2xl font-black text-white mb-6">Financial & Commissions</h2>
                  
                  <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6 shadow-xl">
                    <div>
                      <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                        Default VIG Rate
                      </label>
                      <p className="text-xs text-neutral-500 mb-3 font-semibold">
                        The fallback multiplier applied to dead costs if a rep doesn't hit their goal and has no manual override.
                      </p>
                      <input 
                        type="number" step="0.1"
                        value={settings.default_vig_rate || ''}
                        onChange={e => handleUpdateSetting('default_vig_rate', e.target.value)}
                        className="w-32 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <hr className="border-neutral-800" />
                    <div>
                      <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                        Commission Split Percentage
                      </label>
                      <p className="text-xs text-neutral-500 mb-3 font-semibold">
                        The default percentage of total profit awarded to the rep as commission. Standard is 50%.
                      </p>
                      <div className="flex items-center gap-3">
                        <input 
                          type="number" step="1"
                          value={settings.commission_rate_pct || ''}
                          onChange={e => handleUpdateSetting('commission_rate_pct', e.target.value)}
                          className="w-32 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                        />
                        <span className="text-neutral-500 font-black">%</span>
                      </div>
                    </div>
                    <hr className="border-neutral-800" />
                    <div>
                      <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                        Credit Card Fee Rate
                      </label>
                      <p className="text-xs text-neutral-500 mb-3 font-semibold">
                        The percentage deduction taken from the payment amount for CC processing fees when calculating profit.
                      </p>
                      <div className="flex items-center gap-3">
                        <input 
                          type="number" step="0.1"
                          value={settings.cc_fee_rate || ''}
                          onChange={e => handleUpdateSetting('cc_fee_rate', e.target.value)}
                          className="w-32 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                        />
                        <span className="text-neutral-500 font-black">%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* COMMUNICATIONS TAB */}
              {activeTab === 'communications' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <h2 className="text-2xl font-black text-white mb-6">AI & Communications</h2>
                  
                  <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6 shadow-xl">
                    <div>
                      <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                        SMS Daily Blast Limit
                      </label>
                      <p className="text-xs text-neutral-500 mb-3 font-semibold">
                        The maximum number of times a single account can be targeted by a campaign blast in a 24-hour period.
                      </p>
                      <input 
                        type="number"
                        value={settings.sms_daily_account_limit || ''}
                        onChange={e => handleUpdateSetting('sms_daily_account_limit', e.target.value)}
                        className="w-32 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <hr className="border-neutral-800" />
                    <div>
                      <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                        Magic Reply System Prompt
                      </label>
                      <p className="text-xs text-neutral-500 mb-3 font-semibold">
                        Instructions for the AI when generating SMS reply suggestions. Define the persona, tone, and goals.
                      </p>
                      <textarea 
                        value={settings.ai_reply_prompt || ''}
                        onChange={e => handleUpdateSetting('ai_reply_prompt', e.target.value)}
                        rows={6}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-neutral-300 focus:outline-none focus:border-blue-500 resize-y font-mono text-xs leading-relaxed"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SHIPPING TAB */}
              {activeTab === 'shipping' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <h2 className="text-2xl font-black text-white mb-6">Shipping & Logistics</h2>
                  
                  <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6 shadow-xl">
                    <div>
                      <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                        Shipping Cost Multiplier
                      </label>
                      <p className="text-xs text-neutral-500 mb-3 font-semibold">
                        Multiplier applied to base shipping quotes to account for handling fees (e.g. 1.5x means a $10 label is charged at $15).
                      </p>
                      <div className="flex items-center gap-3">
                        <input 
                          type="number" step="0.1"
                          value={settings.shipping_multiplier || ''}
                          onChange={e => handleUpdateSetting('shipping_multiplier', e.target.value)}
                          className="w-32 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                        />
                        <span className="text-neutral-500 font-black">x</span>
                      </div>
                    </div>
                    <hr className="border-neutral-800" />
                    <div>
                      <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                        Default Package Weight (lbs)
                      </label>
                      <p className="text-xs text-neutral-500 mb-3 font-semibold">
                        Fallback weight used for return labels or quick shipments if none is provided.
                      </p>
                      <div className="flex items-center gap-3">
                        <input 
                          type="number" step="0.1"
                          value={settings.default_shipping_weight || ''}
                          onChange={e => handleUpdateSetting('default_shipping_weight', e.target.value)}
                          className="w-32 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
                        />
                        <span className="text-neutral-500 font-black">lbs</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* DEVELOPER TAB */}
              {activeTab === 'developer' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <h2 className="text-2xl font-black text-white mb-6">Developer Tools</h2>
                  
                  <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6 shadow-xl">
                    <div>
                      <h3 className="text-lg font-bold text-white mb-4">Test Push Notifications</h3>
                      <div className="space-y-4 max-w-md">
                        <div>
                          <label className="block text-xs font-black text-neutral-500 uppercase tracking-wider mb-1">
                            Select User
                          </label>
                          <select
                            value={testUserId}
                            onChange={e => setTestUserId(e.target.value)}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                          >
                            {users.map(u => (
                              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                            ))}
                          </select>
                        </div>
                        
                        <div>
                          <label className="block text-xs font-black text-neutral-500 uppercase tracking-wider mb-1">
                            Notification Title
                          </label>
                          <input
                            type="text"
                            value={testTitle}
                            onChange={e => setTestTitle(e.target.value)}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-black text-neutral-500 uppercase tracking-wider mb-1">
                            Notification Body
                          </label>
                          <textarea
                            value={testBody}
                            onChange={e => setTestBody(e.target.value)}
                            rows={2}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 resize-none"
                          />
                        </div>

                        <div className="pt-2">
                          <button 
                            onClick={handleSendTestNotification}
                            disabled={sendingPush}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition-colors disabled:opacity-50 text-sm w-full"
                          >
                            {sendingPush ? "Sending..." : "Send Test Push Alert"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
