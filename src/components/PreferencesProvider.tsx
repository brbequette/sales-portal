"use client"
import React, { createContext, useContext, useEffect, useState } from "react"
import { useZoho } from "./ZohoProvider"

interface UserPreferences {
  defaultPageSize: number | "All"
  showHiddenReps?: boolean
  // Dashboard filter persistence
  effort?: "sales" | "call_list" | "cold_call" | "dashboard"
  ownerFilter?: string
  sortBy?: "default" | "timezone_asc" | "timezone_desc" | "recentOrders_desc" | "recentOrders_asc" | "ltv_desc" | "ltv_asc"
  searchQuery?: string
  timezoneFilter?: string
  qualityFilter?: string
  yearFilter?: string
  statusFilter?: string
  industryFilter?: string
  onlyWithSales?: boolean
  showDoNotCall?: boolean
  taskFilterTab?: "due" | "pending" | "completed" | "all"
  taskTypeFilter?: string
  // Notification & Reminder preferences
  reminderMethodPush?: boolean
  reminderMethodSms?: boolean
  reminderMethodEmail?: boolean
  defaultReminderMinutes?: number
}

interface PreferencesContextProps {
  preferences: UserPreferences
  updatePreferences: (prefs: Partial<UserPreferences>) => void
}

const PreferencesContext = createContext<PreferencesContextProps>({
  preferences: { defaultPageSize: 25, showHiddenReps: false },
  updatePreferences: () => {},
})

export const usePreferences = () => useContext(PreferencesContext)

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { zohoContext: user } = useZoho()
  const [preferences, setPreferences] = useState<UserPreferences>({ defaultPageSize: 25 })

  useEffect(() => {
    if (!user?.email) return
    try {
      const saved = localStorage.getItem(`user_pref_${user.email}`)
      if (saved) {
        setPreferences(JSON.parse(saved))
      } else {
        setPreferences({ defaultPageSize: 25 })
      }
    } catch (e) {
      console.error("Failed to load user preferences", e)
    }
  }, [user?.email])

  const updatePreferences = (newPrefs: Partial<UserPreferences>) => {
    if (!user?.email) return
    setPreferences((prev) => {
      const updated = { ...prev, ...newPrefs }
      try {
        localStorage.setItem(`user_pref_${user.email}`, JSON.stringify(updated))
      } catch (e) {
        console.error("Failed to save user preferences", e)
      }
      return updated
    })
  }

  return (
    <PreferencesContext.Provider value={{ preferences, updatePreferences }}>
      {children}
    </PreferencesContext.Provider>
  )
}
