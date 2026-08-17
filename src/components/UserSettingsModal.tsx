import React, { useState, useEffect } from "react"
import { FiX, FiCheck, FiBell, FiSmartphone, FiMail, FiUser, FiDownload, FiCheckSquare } from "react-icons/fi"
import { usePreferences } from "./PreferencesProvider"
import { useZoho } from "./ZohoProvider"
import { useNotifications } from "./NotificationProvider"
import { toast } from "react-hot-toast"
import { COMPANY_CONFIG } from "@/lib/company-config"

interface UserSettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function UserSettingsModal({ isOpen, onClose }: UserSettingsModalProps) {
  const { preferences, updatePreferences } = usePreferences()
  const { zohoContext: user } = useZoho()
  const { requestPermission, permission } = useNotifications()
  const [pageSize, setPageSize] = useState<number | "All">(preferences.defaultPageSize)

  // Reminder preferences
  const [pushEnabled, setPushEnabled] = useState(preferences.reminderMethodPush ?? true)
  const [smsEnabled, setSmsEnabled] = useState(preferences.reminderMethodSms ?? false)
  const [emailEnabled, setEmailEnabled] = useState(preferences.reminderMethodEmail ?? false)
  const [defaultReminderMinutes, setDefaultReminderMinutes] = useState(preferences.defaultReminderMinutes ?? 30)

  // vCard Profile & SMS preferences
  const [userId, setUserId] = useState<string | null>(null)
  const [vcardName, setVcardName] = useState("")
  const [vcardTitle, setVcardTitle] = useState("")
  const [vcardPhone, setVcardPhone] = useState("")
  const [vcardEmail, setVcardEmail] = useState("")
  const [vcardCompany, setVcardCompany] = useState(COMPANY_CONFIG.name)
  const [vcardWebsite, setVcardWebsite] = useState("https://tdusales.com")
  const [vcardPhotoUrl, setVcardPhotoUrl] = useState("")
  const [autoAttachVCard, setAutoAttachVCard] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)

  // Fetch current user details when modal opens
  useEffect(() => {
    if (isOpen) {
      setPageSize(preferences.defaultPageSize)
      setPushEnabled(preferences.reminderMethodPush ?? true)
      setSmsEnabled(preferences.reminderMethodSms ?? false)
      setEmailEnabled(preferences.reminderMethodEmail ?? false)
      setDefaultReminderMinutes(preferences.defaultReminderMinutes ?? 30)

      fetch('/api/get-user')
        .then(r => r.json())
        .then(u => {
          if (u && (u.dbId || u.id)) {
            setUserId(u.dbId || u.id)
            setVcardName(u.name || "")
            setVcardEmail(u.email || "")
            setVcardPhone(u.phone || "")
            setVcardTitle(u.title || "Sales Representative")
            setVcardCompany(u.vcardCompany || COMPANY_CONFIG.name)
            setVcardWebsite(u.vcardWebsite || "https://tdusales.com")
            setVcardPhotoUrl(u.vcardPhotoUrl || "")
            setAutoAttachVCard(u.autoAttachVCard ?? false)
          }
        })
        .catch(console.error)
    }
  }, [isOpen, preferences])

  if (!isOpen) return null

  const handleSave = async () => {
    try {
      setSavingProfile(true)

      if (userId) {
        const res = await fetch('/api/admin/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: userId,
            name: vcardName,
            email: vcardEmail,
            phone: vcardPhone,
            title: vcardTitle,
            vcardCompany,
            vcardWebsite,
            vcardPhotoUrl,
            autoAttachVCard
          })
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `Server responded with status ${res.status}`)
        }

        const data = await res.json()
        if (!data.success) {
          throw new Error(data.error || "Failed to update profile details.")
        }
      }

      updatePreferences({
        defaultPageSize: pageSize,
        reminderMethodPush: pushEnabled,
        reminderMethodSms: smsEnabled,
        reminderMethodEmail: emailEnabled,
        defaultReminderMinutes: defaultReminderMinutes
      })

      toast.success("User preferences & vCard profile saved!")
      onClose()
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || "Failed to save settings. Please try again.")
    } finally {
      setSavingProfile(false)
    }
  }

  const handleEnablePush = async () => {
    await requestPermission()
    setPushEnabled(true)
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative glass-panel border border-white/10 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="glass-panel px-5 py-4 border-b border-white/10 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">User Settings</h2>
            {user && (
              <p className="text-[10px] text-neutral-500 mt-0.5">
                Preferences for <span className="font-bold text-neutral-300">{vcardName || user.name}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white p-1 bg-neutral-800 hover:bg-neutral-750 transition-colors rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg cursor-pointer"
          >
            <FiX size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 flex-1 bg-black/20 overflow-y-auto">
          {/* DIGITAL VCARD CONTACT CARD SECTION */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🎴</span>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Digital vCard & SMS Contact Profile</h3>
              </div>
              {userId && (
                <a
                  href={`/api/vcard/${userId}`}
                  download={`${(vcardName || 'rep').replace(/\s+/g, '_')}_Titan_Diamond.vcf`}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30 hover:bg-orange-500/30 transition-all flex items-center gap-1 cursor-pointer"
                >
                  <FiDownload size={11} /> Download .vcf
                </a>
              )}
            </div>

            <p className="text-[10px] text-neutral-500 leading-relaxed">
              Customize how your digital contact card appears when shared with customers via SMS or downloadable file.
            </p>

            {/* Editable vCard Profile Photo & Fields */}
            <div className="p-4 bg-neutral-900/60 rounded-xl border border-white/10 space-y-3">
              <div className="flex items-center gap-3">
                {vcardPhotoUrl ? (
                  <img src={vcardPhotoUrl} alt="Avatar" className="w-12 h-12 rounded-full object-cover border-2 border-orange-500/60 shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-400 font-bold text-base shrink-0">
                    <FiUser size={20} />
                  </div>
                )}
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-neutral-400 block mb-1">Profile Photo URL or Upload</label>
                  <input
                    type="text"
                    value={vcardPhotoUrl}
                    onChange={e => setVcardPhotoUrl(e.target.value)}
                    placeholder="https://tdusales.com/photos/me.jpg or paste image link..."
                    className="w-full bg-black/60 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                <div>
                  <label className="text-[10px] font-bold text-neutral-400 block mb-1">Full Name</label>
                  <input
                    type="text"
                    value={vcardName}
                    onChange={e => setVcardName(e.target.value)}
                    className="w-full bg-black/60 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-neutral-400 block mb-1">Job Title / Role</label>
                  <input
                    type="text"
                    value={vcardTitle}
                    onChange={e => setVcardTitle(e.target.value)}
                    placeholder="Senior Sales Representative"
                    className="w-full bg-black/60 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-neutral-400 block mb-1">Direct Phone Number</label>
                  <input
                    type="text"
                    value={vcardPhone}
                    onChange={e => setVcardPhone(e.target.value)}
                    placeholder="(800) 555-0199"
                    className="w-full bg-black/60 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-neutral-400 block mb-1">Email Address</label>
                  <input
                    type="email"
                    value={vcardEmail}
                    onChange={e => setVcardEmail(e.target.value)}
                    className="w-full bg-black/60 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-neutral-400 block mb-1">Company Name</label>
                  <input
                    type="text"
                    value={vcardCompany}
                    onChange={e => setVcardCompany(e.target.value)}
                    className="w-full bg-black/60 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-neutral-400 block mb-1">Website URL</label>
                  <input
                    type="text"
                    value={vcardWebsite}
                    onChange={e => setVcardWebsite(e.target.value)}
                    className="w-full bg-black/60 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Auto Attach Checkbox */}
              <div className="pt-2 border-t border-neutral-800 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-white">Auto-attach vCard to Outgoing SMS</p>
                  <p className="text-[10px] text-neutral-500">Appends contact card link to all outgoing text messages</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoAttachVCard(!autoAttachVCard)}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${autoAttachVCard ? 'bg-orange-500' : 'bg-neutral-700'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${autoAttachVCard ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Records per page */}
          <div className="border-t border-white/10 pt-6 space-y-2">
            <label className="text-xs font-bold text-neutral-400 block">Default Records per Page</label>
            <p className="text-[10px] text-neutral-500 leading-relaxed">
              Choose the default number of items shown in tables (Sales Hub, Collections, etc.) upon page load.
            </p>
            <select
              value={pageSize}
              onChange={(e) => {
                const val = e.target.value
                setPageSize(val === "All" ? "All" : Number(val))
              }}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="10">10 items</option>
              <option value="25">25 items</option>
              <option value="50">50 items</option>
              <option value="100">100 items</option>
              <option value="All">Show All</option>
            </select>
          </div>

          {/* Notifications & Reminders Section */}
          <div className="border-t border-white/10 pt-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <FiBell className="text-amber-400" size={16} />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Notifications & Reminders</h3>
            </div>
            <p className="text-[10px] text-neutral-500 leading-relaxed">
              Choose how you want to be notified when task reminders fire. These are your default preferences -- you can override them per task.
            </p>

            {/* Push Notification */}
            <div className="space-y-2">
              <div className="flex items-center justify-between glass-panel border border-white/10 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${pushEnabled && permission === 'granted' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-800 text-neutral-500'}`}>
                    <FiBell size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Push Notifications</p>
                    <p className="text-[10px] text-neutral-500">
                      {permission === 'granted' ? 'Browser notifications enabled' : permission === 'denied' ? 'Blocked -- enable in browser settings' : 'Click to enable browser notifications'}
                    </p>
                  </div>
                </div>
                {permission === 'granted' ? (
                  <button
                    onClick={() => setPushEnabled(!pushEnabled)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${pushEnabled ? 'bg-emerald-500' : 'bg-neutral-700'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${pushEnabled ? 'left-5' : 'left-0.5'}`} />
                  </button>
                ) : permission === 'default' ? (
                  <button
                    onClick={handleEnablePush}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg transition-colors"
                  >
                    Enable
                  </button>
                ) : (
                  <span className="text-[10px] text-red-400 font-bold">Blocked</span>
                )}
              </div>
            </div>

            {/* SMS */}
            <div className="flex items-center justify-between glass-panel border border-white/10 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${smsEnabled ? 'bg-blue-500/20 text-blue-400' : 'bg-neutral-800 text-neutral-500'}`}>
                  <FiSmartphone size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">SMS Notifications</p>
                  <p className="text-[10px] text-neutral-500">Text message reminders to your phone</p>
                </div>
              </div>
              <button
                onClick={() => setSmsEnabled(!smsEnabled)}
                className={`relative w-10 h-5 rounded-full transition-colors ${smsEnabled ? 'bg-blue-500' : 'bg-neutral-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${smsEnabled ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            {/* Email */}
            <div className="flex items-center justify-between glass-panel border border-white/10 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${emailEnabled ? 'bg-purple-500/20 text-purple-400' : 'bg-neutral-800 text-neutral-500'}`}>
                  <FiMail size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Email Notifications</p>
                  <p className="text-[10px] text-neutral-500">Email reminders to {vcardEmail || user?.email || 'your inbox'}</p>
                </div>
              </div>
              <button
                onClick={() => setEmailEnabled(!emailEnabled)}
                className={`relative w-10 h-5 rounded-full transition-colors ${emailEnabled ? 'bg-purple-500' : 'bg-neutral-700'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${emailEnabled ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>

            {/* Default Reminder Timing */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-neutral-400 block">Default Reminder Timing</label>
              <p className="text-[10px] text-neutral-500 leading-relaxed">
                How early before a task is due should the reminder fire by default?
              </p>
              <select
                value={defaultReminderMinutes}
                onChange={(e) => setDefaultReminderMinutes(Number(e.target.value))}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value={0}>At time of due date</option>
                <option value={5}>5 minutes before</option>
                <option value={15}>15 minutes before</option>
                <option value={30}>30 minutes before</option>
                <option value={60}>1 hour before</option>
                <option value={120}>2 hours before</option>
                <option value={1440}>1 day before</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 glass-panel flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={savingProfile}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-900/20 cursor-pointer disabled:opacity-50"
          >
            <FiCheck size={14} /> {savingProfile ? "Saving..." : "Save Preferences"}
          </button>
        </div>
      </div>
    </div>
  )
}
