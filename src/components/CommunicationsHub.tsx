"use client"


import { useState } from "react"
import { FiList, FiFileText, FiMessageSquare, FiPhone, FiMail } from "react-icons/fi"
import { SaleCommunications } from "./SaleCommunications"
import { AccountDialer } from "./AccountDialer"

interface CommunicationsHubProps {
  accountId: string
  dealId?: string
  account?: any
  contacts?: any[]
}

type TabType = "ALL" | "NOTES" | "SMS" | "CALLS" | "EMAILS"

export function CommunicationsHub({ accountId, dealId, account, contacts }: CommunicationsHubProps) {
  const [activeTab, setActiveTab] = useState<TabType>("ALL")

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "ALL", label: "All Activity", icon: <FiList size={14} /> },
    { id: "NOTES", label: "Notes", icon: <FiFileText size={14} /> },
    { id: "SMS", label: "SMS", icon: <FiMessageSquare size={14} /> },
    { id: "CALLS", label: "Calls", icon: <FiPhone size={14} /> },
    { id: "EMAILS", label: "Emails", icon: <FiMail size={14} /> },
  ]

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-white border border-neutral-800 rounded-xl overflow-hidden shadow-xl">
      {/* Header Tabs */}
      <div className="flex space-x-1 border-b border-neutral-800 bg-neutral-900/50 p-2 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-neutral-800 text-white shadow-sm border border-neutral-700"
                : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50 border border-transparent"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {activeTab === "ALL" && (
          <SaleCommunications zohoId={dealId || accountId} />
        )}
        
        {activeTab === "NOTES" && (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-500 gap-3">
            <FiFileText size={32} className="opacity-40" />
            <span className="text-sm font-semibold">Notes Placeholder</span>
            <p className="text-xs text-neutral-600">Integrate NotesList component here</p>
          </div>
        )}
        
        {activeTab === "SMS" && (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-500 gap-3">
            <FiMessageSquare size={32} className="opacity-40" />
            <span className="text-sm font-semibold">SMS Thread Placeholder</span>
            <p className="text-xs text-neutral-600">Integrate SmsThread component here</p>
          </div>
        )}
        
        {activeTab === "CALLS" && (
          <div className="h-[600px] border border-neutral-800 rounded-xl overflow-hidden">
             {/* Use AccountDialer here as it already handles calls */}
             <AccountDialer accountId={accountId} account={account} contacts={contacts || []} />
          </div>
        )}
        
        {activeTab === "EMAILS" && (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-500 gap-3">
            <FiMail size={32} className="opacity-40" />
            <span className="text-sm font-semibold">Emails Placeholder</span>
            <p className="text-xs text-neutral-600">Integrate EmailThread component here</p>
          </div>
        )}
      </div>
    </div>
  )
}

