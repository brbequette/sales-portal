import React, { useState } from "react"
import { FiX, FiCheck } from "react-icons/fi"
import { usePreferences } from "./PreferencesProvider"
import { useZoho } from "./ZohoProvider"

interface UserSettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function UserSettingsModal({ isOpen, onClose }: UserSettingsModalProps) {
  const { preferences, updatePreferences } = usePreferences()
  const { zohoContext: user } = useZoho()
  const [pageSize, setPageSize] = useState<number | "All">(preferences.defaultPageSize)

  if (!isOpen) return null

  const handleSave = () => {
    updatePreferences({ defaultPageSize: pageSize })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-neutral-850 px-5 py-4 border-b border-neutral-800 flex justify-between items-center shrink-0">
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
        <div className="p-6 space-y-6 flex-1 bg-neutral-950">
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
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-neutral-800 bg-neutral-900 flex justify-end gap-3 shrink-0">
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
