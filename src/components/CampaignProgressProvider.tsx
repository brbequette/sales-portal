"use client"

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react"
import { campaignManager, type CampaignState } from "@/lib/campaign-manager"

interface CampaignProgressContextValue {
  state: CampaignState
  start: typeof campaignManager.start
  cancel: () => Promise<void>
  sendSample: typeof campaignManager.sendSample
  showModal: boolean
  setShowModal: (v: boolean) => void
}

const CampaignProgressContext = createContext<CampaignProgressContextValue | null>(null)

export function CampaignProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CampaignState>(campaignManager.getState())
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    // Initialize singleton (reconnects to any in-progress job from localStorage)
    campaignManager.init()

    // Sync singleton state → React state
    const unsub = campaignManager.subscribe((s) => setState(s))
    return unsub
  }, [])

  const start = useCallback<typeof campaignManager.start>(
    (config) => campaignManager.start(config),
    []
  )
  const cancel = useCallback(() => campaignManager.cancel(), [])
  const sendSample = useCallback<typeof campaignManager.sendSample>(
    (config) => campaignManager.sendSample(config),
    []
  )

  return (
    <CampaignProgressContext.Provider value={{ state, start, cancel, sendSample, showModal, setShowModal }}>
      {children}
    </CampaignProgressContext.Provider>
  )
}

export function useCampaignProgress() {
  const ctx = useContext(CampaignProgressContext)
  if (!ctx) throw new Error("useCampaignProgress must be used inside CampaignProgressProvider")
  return ctx
}
