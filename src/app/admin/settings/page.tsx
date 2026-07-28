"use client"
import { useState, useEffect } from "react"
import { FiSave, FiSettings, FiDollarSign, FiMessageSquare, FiTruck, FiTool, FiMonitor } from "react-icons/fi"
import VigManagementBuilder from "@/components/VigManagementBuilder"

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

      try {
        const usersRes = await fetch('/api/get-users')
        const usersData = await usersRes.json()
        if (usersData.users) {
          setUsers(usersData.users)
          if (usersData.users.length > 0) {
            setTestUserId(usersData.users[0].id)
          }
        }
      } catch (err) {
        console.error('Failed to load users for test notification:', err)
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
      <header className="px-6 py-5 border-b border-white/10 flex justify-between items-center shrink-0">
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
        <div className="w-64 border-r border-white/10 bg-black/20 flex flex-col p-4 gap-2 overflow-y-auto shrink-0">
          <button 
            onClick={() => setActiveTab('financial')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${activeTab === 'financial' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'text-neutral-400 hover:text-white hover:glass-panel border border-transparent'}`}
          >
            <FiDollarSign /> Financial & Commissions
          </button>
          
          <button 
            onClick={() => setActiveTab('communications')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${activeTab === 'communications' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' : 'text-neutral-400 hover:text-white hover:glass-panel border border-transparent'}`}
          >
            <FiMessageSquare /> AI & Communications
          </button>
          
          <button 
            onClick={() => setActiveTab('shipping')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${activeTab === 'shipping' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'text-neutral-400 hover:text-white hover:glass-panel border border-transparent'}`}
          >
            <FiTruck /> Shipping & Logistics
          </button>

          <button 
            onClick={() => setActiveTab('developer')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${activeTab === 'developer' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30' : 'text-neutral-400 hover:text-white hover:glass-panel border border-transparent'}`}
          >
            <FiTool /> Developer Tools
          </button>

          <div className="mt-8"></div>
          <button 
            onClick={() => window.open('/tv', '_blank')}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-black tracking-wide uppercase transition-all duration-300 text-amber-400 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 hover:scale-[1.02] active:scale-95 shadow-[0_0_15px_rgba(245,158,11,0.2)] mt-auto"
          >
            <FiMonitor size={16} /> Launch TV Board
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
              
              {/* EMERGENCY MASS UPDATE PAUSE CONTROL */}
              <div className={`p-5 rounded-2xl border transition-all duration-300 ${settings.pause_mass_zoho_updates ? 'bg-amber-500/10 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.15)]' : 'bg-neutral-900/60 border-white/10'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${settings.pause_mass_zoho_updates ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                      <h3 className="text-base font-black text-white uppercase tracking-wider">
                        {settings.pause_mass_zoho_updates ? '⚠️ Mass Zoho API Updates: PAUSED' : '⚡ Mass Zoho API Updates: ACTIVE'}
                      </h3>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1 font-medium max-w-xl">
                      Toggle ON to instantly pause all mass background recalculations and bulk Zoho API pushes when daily API rate limits are being burned.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUpdateSetting('pause_mass_zoho_updates', !settings.pause_mass_zoho_updates)}
                    className={`px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-200 shrink-0 shadow-md ${settings.pause_mass_zoho_updates ? 'bg-amber-400 text-black hover:bg-amber-300' : 'bg-white/10 text-neutral-300 hover:bg-white/20'}`}
                  >
                    {settings.pause_mass_zoho_updates ? 'Resume Mass Sync' : 'Pause Mass Sync'}
                  </button>
                </div>
              </div>
              
              {/* FINANCIAL TAB */}
              {activeTab === 'financial' && (
                <VigManagementBuilder />
              )}

              {/* COMMUNICATIONS TAB */}
              {activeTab === 'communications' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <h2 className="text-2xl font-black text-white mb-6">AI & Communications</h2>
                  
                  <div className="glass-panel border border-white/10 rounded-xl p-6 space-y-6 shadow-xl">
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
                        className="w-32 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <hr className="border-white/10" />
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
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-neutral-300 focus:outline-none focus:border-blue-500 resize-y font-mono text-xs leading-relaxed"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SHIPPING TAB */}
              {activeTab === 'shipping' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <h2 className="text-2xl font-black text-white mb-6">Shipping & Logistics</h2>
                  
                  <div className="glass-panel border border-white/10 rounded-xl p-6 space-y-6 shadow-xl">
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
                          className="w-32 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                        />
                        <span className="text-neutral-500 font-black">x</span>
                      </div>
                    </div>
                    <hr className="border-white/10" />
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
                          className="w-32 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:border-amber-500"
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
                  
                  <div className="glass-panel border border-white/10 rounded-xl p-6 space-y-6 shadow-xl">
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
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
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
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
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
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 resize-none"
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
