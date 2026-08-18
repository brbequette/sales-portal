"use client"
import { useState, useEffect, useCallback } from "react"
import { FiSave, FiSettings, FiDollarSign, FiMessageSquare, FiTruck, FiTool, FiRefreshCw, FiMonitor, FiAlertCircle, FiCheckCircle } from "react-icons/fi"
import VigManagementBuilder from "@/components/VigManagementBuilder"
import { ThemeSettingsModal } from "@/components/ThemeSettingsModal"

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<'financial'|'communications'|'shipping'|'developer'|'sync'>('financial')
  const [settings, setSettings] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false)

  // ── Sync Control state ──────────────────────────────────────────────
  const [syncConfig, setSyncConfig] = useState<any>({
    leads:       { enabled: false, intervalMinutes: 0 },
    invoices:    { enabled: false, intervalMinutes: 0 },
    salesOrders: { enabled: false, intervalMinutes: 0 },
    accounts:    { enabled: false, intervalMinutes: 0 },
  })
  const [syncStatus, setSyncStatus] = useState<any>({})
  const [syncingTable, setSyncingTable] = useState<string | null>(null)
  const [savingSync, setSavingSync] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const SYNC_TABLES = [
    { key: 'leads',       label: 'Leads',        icon: '👤', color: 'violet' },
    { key: 'invoices',    label: 'Invoices',      icon: '🧾', color: 'emerald' },
    { key: 'salesOrders', label: 'Sales Orders',  icon: '📦', color: 'amber' },
    { key: 'accounts',    label: 'Accounts',      icon: '🏢', color: 'blue' },
  ]

  const INTERVAL_OPTIONS = [
    { label: 'Manual only', value: 0 },
    { label: 'Every 30 min', value: 30 },
    { label: 'Every hour', value: 60 },
    { label: 'Every 2 hours', value: 120 },
    { label: 'Every 4 hours', value: 240 },
    { label: 'Every 8 hours', value: 480 },
    { label: 'Every 24 hours', value: 1440 },
  ]

  const fetchSyncData = useCallback(async () => {
    try {
      const [configRes, statusRes] = await Promise.all([
        fetch('/api/admin/sync-config'),
        fetch('/api/sync-status'),
      ])
      const configData = await configRes.json()
      const statusData = await statusRes.json()
      if (configData.success) setSyncConfig(configData.config)
      if (statusData.success) setSyncStatus(statusData.tables)
    } catch (e) {
      console.error('Failed to fetch sync data', e)
    }
  }, [])

  const handleSaveSyncConfig = async () => {
    setSavingSync(true)
    try {
      await fetch('/api/admin/sync-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: syncConfig }),
      })
      setSyncMsg('Sync settings saved!')
      setTimeout(() => setSyncMsg(''), 3000)
    } catch {
      setSyncMsg('Save failed')
    } finally {
      setSavingSync(false)
    }
  }

  const handleForceSync = async (table: string) => {
    setSyncingTable(table)
    try {
      await fetch('/api/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: [table], force: true }),
      })
      await fetchSyncData()
      setSyncMsg(`${table} synced successfully`)
      setTimeout(() => setSyncMsg(''), 3000)
    } catch {
      setSyncMsg('Sync failed')
    } finally {
      setSyncingTable(null)
    }
  }

  function formatAge(minutes: number | null): string {
    if (minutes === null || minutes === undefined) return 'never'
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hrs = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hrs}h ${mins}m ago` : `${hrs}h ago`
  }

  // Test Notification state
  const [users, setUsers] = useState<any[]>([])
  const [testUserId, setTestUserId] = useState("")
  const [testTitle, setTestTitle] = useState("Test Notification")
  const [testBody, setTestBody] = useState("This is a cross-device test notification from the admin panel.")
  const [sendingPush, setSendingPush] = useState(false)

  useEffect(() => {
    fetchSettings()
    fetchSyncData()
  }, [fetchSyncData])

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
    <div className="page-content">
      <ThemeSettingsModal isOpen={isThemeModalOpen} onClose={() => setIsThemeModalOpen(false)} />
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-neutral-500/10 border border-neutral-500/20 rounded-xl flex items-center justify-center">
            <FiSettings className="text-neutral-400" size={17} />
          </div>
          <div>
            <h1 className="page-title">System Settings</h1>
            <p className="page-subtitle">Configure application defaults and global preferences</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsThemeModalOpen(true)}
            className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg font-bold text-xs transition-all flex items-center gap-2"
          >
            <FiSettings size={15} /> Theme & Colors
          </button>
          <button 
            onClick={handleSave}
            disabled={saving || loading}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiSave />}
            Save Changes
          </button>
        </div>
      </div>

      <div className="page-body">
        <div className="flex flex-1 overflow-hidden h-full">
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

          <button 
            onClick={() => setActiveTab('sync')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-colors ${activeTab === 'sync' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' : 'text-neutral-400 hover:text-white hover:glass-panel border border-transparent'}`}
          >
            <FiRefreshCw /> Sync Control
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
                <div className="space-y-8">
                  <VigManagementBuilder />

                  {/* ── Commission & Cost Calculation Settings ──────────────── */}
                  <div className="glass-panel border border-white/10 rounded-2xl p-6 space-y-6 shadow-xl">
                    <div>
                      <h3 className="text-lg font-black text-white flex items-center gap-2">
                        <FiDollarSign className="text-emerald-400" /> Commission & Cost Calculation
                      </h3>
                      <p className="text-xs text-neutral-500 mt-1 font-medium">
                        Control how profit and commission are derived across all invoices and sales orders.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {/* Commission Rate */}
                      <div>
                        <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                          Commission Rate (%)
                        </label>
                        <p className="text-xs text-neutral-500 mb-3 font-semibold">
                          Percentage of net profit paid as commission to the sales rep. Default: 50%
                        </p>
                        <div className="flex items-center gap-3">
                          <input
                            type="number" step="1" min="0" max="100"
                            value={settings.commission_rate_pct ?? ''}
                            onChange={e => handleUpdateSetting('commission_rate_pct', e.target.value)}
                            className="w-32 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                          />
                          <span className="text-neutral-500 font-black">%</span>
                        </div>
                      </div>

                      {/* Dead Cost Fallback */}
                      <div>
                        <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                          Dead Cost Fallback (%)
                        </label>
                        <p className="text-xs text-neutral-500 mb-3 font-semibold">
                          When no item cost data is available, estimate dead cost as this % of the subtotal. Default: 60%
                        </p>
                        <div className="flex items-center gap-3">
                          <input
                            type="number" step="1" min="0" max="100"
                            value={settings.dead_cost_fallback_pct ?? ''}
                            onChange={e => handleUpdateSetting('dead_cost_fallback_pct', e.target.value)}
                            className="w-32 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                          />
                          <span className="text-neutral-500 font-black">%</span>
                        </div>
                      </div>

                      {/* Loss Split */}
                      <div>
                        <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                          Loss Split (%)
                        </label>
                        <p className="text-xs text-neutral-500 mb-3 font-semibold">
                          When an invoice has negative profit, the rep absorbs this % of the loss. Default: 50%
                        </p>
                        <div className="flex items-center gap-3">
                          <input
                            type="number" step="1" min="0" max="100"
                            value={settings.loss_split_pct ?? ''}
                            onChange={e => handleUpdateSetting('loss_split_pct', e.target.value)}
                            className="w-32 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-rose-400 font-mono font-bold focus:outline-none focus:border-rose-500"
                          />
                          <span className="text-neutral-500 font-black">%</span>
                        </div>
                      </div>

                      {/* Per-Item Cost Fallback */}
                      <div>
                        <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                          Per-Item Cost Fallback (%)
                        </label>
                        <p className="text-xs text-neutral-500 mb-3 font-semibold">
                          When an individual line item has no purchase cost, estimate it as this % of its sell rate. Default: 60%
                        </p>
                        <div className="flex items-center gap-3">
                          <input
                            type="number" step="1" min="0" max="100"
                            value={settings.per_item_cost_fallback_pct ?? ''}
                            onChange={e => handleUpdateSetting('per_item_cost_fallback_pct', e.target.value)}
                            className="w-32 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                          />
                          <span className="text-neutral-500 font-black">%</span>
                        </div>
                      </div>
                    </div>

                    {/* CC Fee Rate */}
                    <hr className="border-white/10" />
                    <div>
                      <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                        Credit Card Processing Fee (%)
                      </label>
                      <p className="text-xs text-neutral-500 mb-3 font-semibold">
                        Applied to invoice subtotal when estimating CC fees. Default: 4.5%
                      </p>
                      <div className="flex items-center gap-3">
                        <input
                          type="number" step="0.1" min="0" max="20"
                          value={settings.cc_fee_rate ?? ''}
                          onChange={e => handleUpdateSetting('cc_fee_rate', e.target.value)}
                          className="w-32 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white font-mono font-bold focus:outline-none focus:border-blue-500"
                        />
                        <span className="text-neutral-500 font-black">%</span>
                      </div>
                    </div>

                    {/* Tariff Surcharge Rate */}
                    <hr className="border-white/10" />
                    <div>
                      <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">
                        Tariff Surcharge Rate (%)
                      </label>
                      <p className="text-xs text-neutral-500 mb-3 font-semibold">
                        Tariff surcharge applied to non-gift dead cost on unpaid invoices. Default: 12.5%
                      </p>
                      <div className="flex items-center gap-3">
                        <input
                          type="number" step="0.1" min="0" max="50"
                          value={settings.tariff_surcharge_rate != null ? (settings.tariff_surcharge_rate * 100).toFixed(1) : ''}
                          onChange={e => handleUpdateSetting('tariff_surcharge_rate', parseFloat(e.target.value) / 100)}
                          className="w-32 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white font-mono font-bold focus:outline-none focus:border-blue-500"
                        />
                        <span className="text-neutral-500 font-black">%</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Clawback Rules ──────────────────────────────────────── */}
                  <ClawbackSettingsSection />
                </div>
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

                  {/* Origin / Sender Address */}
                  <div className="glass-panel border border-white/10 rounded-xl p-6 space-y-4 shadow-xl mt-6">
                    <h3 className="text-lg font-black text-white">Ship-From Address</h3>
                    <p className="text-xs text-neutral-500 font-semibold -mt-2">
                      Default origin address used for all outgoing shipments and Easyship label purchases.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-neutral-500 mb-1">Company Name</label>
                        <input
                          value={settings.ship_from_company || ''}
                          onChange={e => handleUpdateSetting('ship_from_company', e.target.value)}
                          placeholder="Titan Diamond USA"
                          className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-neutral-500 mb-1">Contact Name</label>
                        <input
                          value={settings.ship_from_contact_name || ''}
                          onChange={e => handleUpdateSetting('ship_from_contact_name', e.target.value)}
                          placeholder="Titan Diamond"
                          className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-neutral-500 mb-1">Street Address</label>
                        <input
                          value={settings.ship_from_address || ''}
                          onChange={e => handleUpdateSetting('ship_from_address', e.target.value)}
                          placeholder="8321 E Evans Road"
                          className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-neutral-500 mb-1">City</label>
                        <input
                          value={settings.ship_from_city || ''}
                          onChange={e => handleUpdateSetting('ship_from_city', e.target.value)}
                          placeholder="Scottsdale"
                          className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-neutral-500 mb-1">State</label>
                          <input
                            value={settings.ship_from_state || ''}
                            onChange={e => handleUpdateSetting('ship_from_state', e.target.value)}
                            placeholder="AZ"
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-neutral-500 mb-1">Zip Code</label>
                          <input
                            value={settings.ship_from_zip || ''}
                            onChange={e => handleUpdateSetting('ship_from_zip', e.target.value)}
                            placeholder="85260"
                            className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-neutral-500 mb-1">Phone</label>
                        <input
                          value={settings.ship_from_phone || ''}
                          onChange={e => handleUpdateSetting('ship_from_phone', e.target.value)}
                          placeholder="4805551234"
                          className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-neutral-500 mb-1">Email</label>
                        <input
                          value={settings.ship_from_email || ''}
                          onChange={e => handleUpdateSetting('ship_from_email', e.target.value)}
                          placeholder="shipping@titandiamond.com"
                          className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Easyship Integration Status */}
                  <div className="glass-panel border border-white/10 rounded-xl p-6 space-y-4 shadow-xl mt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-black text-white">Easyship Integration</h3>
                        <p className="text-xs text-neutral-500 font-semibold mt-1">
                          Live shipping rate comparison via Easyship API
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/shipping/estimate')
                            const data = await res.json()
                            if (data.connected) {
                              alert(`✅ Easyship Connected!\n\nAccount: ${data.accountName || 'Titan Diamond'}\nCurrency: ${data.currency || 'USD'}`)
                            } else {
                              alert(`❌ Easyship not connected: ${data.error || 'API key not configured'}`)
                            }
                          } catch (e: any) {
                            alert(`❌ Connection test failed: ${e.message}`)
                          }
                        }}
                        className="td-btn td-btn-ghost td-btn-sm"
                      >
                        <FiRefreshCw size={13} /> Test Connection
                      </button>
                    </div>
                    <div className="flex items-center gap-3 bg-black/20 rounded-lg p-3 border border-white/5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                        <FiCheckCircle className="text-emerald-400 text-sm" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">API Key Configured</p>
                        <p className="text-[10px] text-neutral-500">
                          Origin address configurable above • Drop-ship from vendors supported
                        </p>
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

              {/* SYNC CONTROL TAB */}
              {activeTab === 'sync' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-black text-white">Sync Control</h2>
                      <p className="text-sm text-neutral-500 mt-1">Configure when each table syncs with Zoho. All syncs are delta-only — only changed records are pulled.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {syncMsg && (
                        <span className={`text-sm font-bold px-3 py-1.5 rounded-lg ${syncMsg.includes('fail') || syncMsg.includes('Error') ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                          {syncMsg}
                        </span>
                      )}
                      <button
                        onClick={handleSaveSyncConfig}
                        disabled={savingSync}
                        className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold transition-colors disabled:opacity-50 text-sm"
                      >
                        <FiSave />
                        {savingSync ? 'Saving…' : 'Save Config'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {SYNC_TABLES.map(({ key, label, icon }) => {
                      const cfg = syncConfig[key] || { enabled: false, intervalMinutes: 0 }
                      const stat = syncStatus[key] || {}
                      const isSyncing = syncingTable === key
                      const hasError = !!stat.lastError
                      const neverSynced = !stat.lastSyncAt
                      const age = stat.ageMinutes

                      return (
                        <div key={key} className="glass-panel border border-white/10 rounded-xl p-5 shadow-xl">
                          <div className="flex items-start justify-between gap-4">
                            {/* Left: Info */}
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              <div className="text-2xl flex-shrink-0">{icon}</div>
                              <div className="min-w-0">
                                <h3 className="text-base font-black text-white">{label}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                  {hasError ? (
                                    <span className="flex items-center gap-1 text-xs text-red-400">
                                      <FiAlertCircle className="flex-shrink-0" />
                                      {stat.lastError}
                                    </span>
                                  ) : neverSynced ? (
                                    <span className="text-xs text-neutral-500">Never synced</span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                                      <FiCheckCircle className="flex-shrink-0" />
                                      Synced {formatAge(age)} · {stat.lastCount ?? 0} records
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right: Controls */}
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {/* Interval Selector */}
                              <div>
                                <label className="block text-[10px] font-black text-neutral-500 uppercase tracking-wider mb-1">Auto-Sync Interval</label>
                                <select
                                  value={cfg.intervalMinutes}
                                  onChange={e => setSyncConfig((prev: any) => ({
                                    ...prev,
                                    [key]: { ...prev[key], intervalMinutes: parseInt(e.target.value) }
                                  }))}
                                  disabled={!cfg.enabled}
                                  className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  {INTERVAL_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Enable Toggle */}
                              <div>
                                <label className="block text-[10px] font-black text-neutral-500 uppercase tracking-wider mb-1">Auto-Sync</label>
                                <button
                                  onClick={() => setSyncConfig((prev: any) => ({
                                    ...prev,
                                    [key]: { ...prev[key], enabled: !prev[key]?.enabled }
                                  }))}
                                  className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none ${cfg.enabled ? 'bg-rose-500' : 'bg-white/10'}`}
                                >
                                  <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform shadow-md ${cfg.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                              </div>

                              {/* Force Sync */}
                              <div>
                                <label className="block text-[10px] font-black text-neutral-500 uppercase tracking-wider mb-1">Manual Sync</label>
                                <button
                                  onClick={() => handleForceSync(key)}
                                  disabled={isSyncing || !!syncingTable}
                                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <FiRefreshCw className={isSyncing ? 'animate-spin' : ''} />
                                  {isSyncing ? 'Syncing…' : 'Sync Now'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Legend */}
                  <div className="mt-6 p-4 bg-white/3 border border-white/5 rounded-xl">
                    <p className="text-xs font-bold text-neutral-400 mb-2">How Smart Sync Works</p>
                    <ul className="space-y-1 text-xs text-neutral-500">
                      <li>• <span className="text-white">Delta-only:</span> Only records modified since the last sync are pulled from Zoho — not the full dataset.</li>
                      <li>• <span className="text-white">Staleness guard:</span> Auto-syncs are skipped if data is already fresher than the configured interval.</li>
                      <li>• <span className="text-white">Manual Only:</span> Set interval to "Manual only" and disable Auto-Sync to fully control when syncs happen.</li>
                      <li>• <span className="text-white">Sync Now:</span> Always forces a fresh delta pull regardless of freshness settings.</li>
                    </ul>
                  </div>
                </div>
              )}
              
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

// ─── Clawback Settings Sub-Component ─────────────────────────────────────────

function ClawbackSettingsSection() {
  const [clawback, setClawback] = useState({
    clawback_threshold_days: 365,
    warning_window_days: 90,
    rep_cost_split_pct: 0.50,
    auto_cascade: false,
    auto_bonus_reversal: false,
    cascade_depth: 'one_month' as 'one_month' | 'recursive',
  })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.settings?.clawback_settings) {
          try {
            const parsed = typeof data.settings.clawback_settings === 'string'
              ? JSON.parse(data.settings.clawback_settings)
              : data.settings.clawback_settings
            setClawback(prev => ({ ...prev, ...parsed }))
          } catch {}
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clawback_settings: JSON.stringify(clawback) })
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      alert('Failed to save clawback settings')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return <div className="glass-panel border border-white/10 rounded-xl p-6 text-neutral-500 text-sm">Loading clawback settings...</div>

  const Field = ({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-sm font-black uppercase tracking-wider text-neutral-300 mb-1">{label}</label>
      <p className="text-xs text-neutral-500 mb-3 font-semibold">{desc}</p>
      {children}
    </div>
  )

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-center">
          <FiAlertCircle className="text-red-400" size={16} />
        </div>
        <div>
          <h2 className="text-xl font-black text-white">Clawback Rules</h2>
          <p className="text-xs text-neutral-500">Configure when invoices are clawed back and how costs cascade</p>
        </div>
      </div>

      <div className="glass-panel border border-white/10 rounded-xl p-6 space-y-6 shadow-xl">
        <Field label="Clawback Threshold (Days)" desc="Unpaid invoices older than this are eligible for clawback. Default: 365 (12 months).">
          <div className="flex items-center gap-3">
            <input
              type="number" min={30} max={730}
              value={clawback.clawback_threshold_days}
              onChange={e => setClawback(p => ({ ...p, clawback_threshold_days: parseInt(e.target.value) || 365 }))}
              className="w-32 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-red-400 font-mono font-bold focus:outline-none focus:border-red-500"
            />
            <span className="text-neutral-500 font-black">days</span>
          </div>
        </Field>

        <hr className="border-white/10" />

        <Field label="Warning Window (Days)" desc="How many days before the threshold to start showing clawback warnings. Default: 90 days.">
          <div className="flex items-center gap-3">
            <input
              type="number" min={14} max={180}
              value={clawback.warning_window_days}
              onChange={e => setClawback(p => ({ ...p, warning_window_days: parseInt(e.target.value) || 90 }))}
              className="w-32 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500"
            />
            <span className="text-neutral-500 font-black">days</span>
          </div>
        </Field>

        <hr className="border-white/10" />

        <Field label="Rep Cost Split (%)" desc="When an invoice is charged off, the rep pays this percentage of (dead cost + shipping). Default: 50%.">
          <div className="flex items-center gap-3">
            <input
              type="number" min={0} max={100} step={5}
              value={Math.round(clawback.rep_cost_split_pct * 100)}
              onChange={e => setClawback(p => ({ ...p, rep_cost_split_pct: (parseInt(e.target.value) || 50) / 100 }))}
              className="w-32 bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white font-mono font-bold focus:outline-none focus:border-blue-500"
            />
            <span className="text-neutral-500 font-black">%</span>
          </div>
        </Field>

        <hr className="border-white/10" />

        <Field label="Cascade Mode" desc="When a clawback changes a month's goal status, should the system auto-apply VIG rate changes or flag for review?">
          <div className="flex gap-3">
            {([
              { val: false, label: 'Warning Only (Review Required)', color: 'amber' },
              { val: true, label: 'Auto-Cascade (Apply Immediately)', color: 'red' },
            ] as const).map(opt => (
              <button
                key={String(opt.val)}
                onClick={() => setClawback(p => ({ ...p, auto_cascade: opt.val }))}
                className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
                  clawback.auto_cascade === opt.val
                    ? `bg-${opt.color}-500/10 border-${opt.color}-500/30 text-${opt.color}-400`
                    : 'border-white/10 text-neutral-500 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        <hr className="border-white/10" />

        <Field label="Bonus Reversal" desc="If a clawback causes a goal to be missed, should earned bonuses be reversed automatically or flagged?">
          <div className="flex gap-3">
            {([
              { val: false, label: 'Flag for Review', color: 'amber' },
              { val: true, label: 'Auto-Reverse', color: 'red' },
            ] as const).map(opt => (
              <button
                key={String(opt.val)}
                onClick={() => setClawback(p => ({ ...p, auto_bonus_reversal: opt.val }))}
                className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
                  clawback.auto_bonus_reversal === opt.val
                    ? `bg-${opt.color}-500/10 border-${opt.color}-500/30 text-${opt.color}-400`
                    : 'border-white/10 text-neutral-500 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        <hr className="border-white/10" />

        <Field label="VIG Cascade Depth" desc="If a clawback causes Month A's goal to flip, the VIG changes in Month B. Should it check if Month B also misses and cascade to Month C?">
          <div className="flex gap-3">
            {([
              { val: 'one_month' as const, label: 'One Month (Recommended)', color: 'emerald' },
              { val: 'recursive' as const, label: 'Recursive (Full Cascade)', color: 'red' },
            ]).map(opt => (
              <button
                key={opt.val}
                onClick={() => setClawback(p => ({ ...p, cascade_depth: opt.val }))}
                className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
                  clawback.cascade_depth === opt.val
                    ? `bg-${opt.color}-500/10 border-${opt.color}-500/30 text-${opt.color}-400`
                    : 'border-white/10 text-neutral-500 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        <hr className="border-white/10" />

        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold rounded-lg shadow-lg shadow-red-900/30 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {saving ? <FiRefreshCw className="animate-spin" size={14} /> : <FiSave size={14} />}
            {saving ? 'Saving...' : 'Save Clawback Rules'}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-bold">
              <FiCheckCircle size={14} /> Saved!
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
