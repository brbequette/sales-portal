"use client"
import { useState, useEffect, useCallback } from "react"
import { FiSave, FiSettings, FiDollarSign, FiMessageSquare, FiTruck, FiTool, FiRefreshCw, FiClock, FiAlertCircle, FiCheckCircle, FiMonitor } from "react-icons/fi"
import VigManagementBuilder from "@/components/VigManagementBuilder"

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<'financial'|'communications'|'shipping'|'developer'|'sync'>('financial')
  const [settings, setSettings] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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
        <button 
          onClick={handleSave}
          disabled={saving || loading}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FiSave />}
          Save Changes
        </button>
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
