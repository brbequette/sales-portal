import React, { useState, useEffect } from "react"
import { FiX, FiCheck, FiBell, FiSmartphone, FiMail } from "react-icons/fi"
import { usePreferences } from "./PreferencesProvider"
import { useZoho } from "./ZohoProvider"
import { useNotifications } from "./NotificationProvider"

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

  // Sync with preferences when modal opens
  useEffect(() => {
    if (isOpen) {
      setPageSize(preferences.defaultPageSize)
      setPushEnabled(preferences.reminderMethodPush ?? true)
      setSmsEnabled(preferences.reminderMethodSms ?? false)
      setEmailEnabled(preferences.reminderMethodEmail ?? false)
      setDefaultReminderMinutes(preferences.defaultReminderMinutes ?? 30)
    }
  }, [isOpen, preferences])

  if (!isOpen) return null

  const handleSave = () => {
    updatePreferences({
      defaultPageSize: pageSize,
      reminderMethodPush: pushEnabled,
      reminderMethodSms: smsEnabled,
      reminderMethodEmail: emailEnabled,
      defaultReminderMinutes: defaultReminderMinutes
    })
    onClose()
  }

  const handleEnablePush = async () => {
    await requestPermission()
    setPushEnabled(true)
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative glass-panel border border-white/10 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="glass-panel px-5 py-4 border-b border-white/10 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">User Settings</h2>
            {user && (
              <p className="text-[10px] text-neutral-500 mt-0.5">
                Preferences for <span className="font-bold text-neutral-350">{user.name}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white p-1 bg-neutral-800 hover:bg-neutral-750 transition-colors rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg"
          >
            <FiX size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 flex-1 bg-black/20 overflow-y-auto">
          {/* Records per page */}
          <div className="space-y-2">
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
              Choose how you want to be notified when task reminders fire. These are your default preferences — you can override them per task.
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
                      {permission === 'granted' ? 'Browser notifications enabled' : permission === 'denied' ? 'Blocked — enable in browser settings' : 'Click to enable browser notifications'}
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
                  <p className="text-[10px] text-neutral-500">Email reminders to {user?.email || 'your inbox'}</p>
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
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl text-xs font-bold text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-900/20"
          >
            <FiCheck size={14} /> Save Preferences
          </button>
        </div>
      </div>
    </div>
  )
}
