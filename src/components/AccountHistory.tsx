"use client"

import { useState } from "react"

export function AccountHistory({ accountId }: { accountId: string }) {
  const [activeTab, setActiveTab] = useState<'invoices' | 'orders' | 'logs'>('logs')

  // Mock data for display
  const invoices = [
    { id: "INV-1001", amount: "$1,250.00", date: "2023-10-15", status: "Paid" },
    { id: "INV-1002", amount: "$3,400.00", date: "2024-05-12", status: "Paid" },
    { id: "INV-1003", amount: "$850.00", date: "2025-01-20", status: "Overdue" },
  ]
  const logs = [
    { id: "LOG-1", date: "2024-05-01", type: "Call", summary: "Left voicemail regarding Q2 restock." },
    { id: "LOG-2", date: "2024-05-12", type: "Call", summary: "Connected. Closed deal for $3,400 invoice." }
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold mb-4 text-(--primary)">Full Account History</h2>
      
      {/* Tabs */}
      <div className="flex border-b border-(--border)">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === 'invoices' 
              ? 'text-(--primary) border-b-2 border-(--primary)' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Invoices
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === 'orders' 
              ? 'text-(--primary) border-b-2 border-(--primary)' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Sales Orders
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === 'logs' 
              ? 'text-(--primary) border-b-2 border-(--primary)' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Comm Logs
        </button>
      </div>

      {/* Content */}
      <div className="pt-4">
        {activeTab === 'invoices' && (
          <div className="space-y-3">
            {invoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between p-4 bg-black/20 border border-(--border) rounded-lg hover:border-(--primary)/50 transition-colors">
                <div>
                  <div className="font-medium">{inv.id}</div>
                  <div className="text-sm text-gray-400">{inv.date}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{inv.amount}</div>
                  <div className={`text-xs font-bold ${inv.status === 'Paid' ? 'text-(--success)' : 'text-(--danger)'}`}>
                    {inv.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {activeTab === 'orders' && (
          <div className="p-8 text-center text-gray-500 border border-dashed border-(--border) rounded-lg">
            No recent sales orders found.
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-3">
            {logs.map(log => (
              <div key={log.id} className="p-4 bg-black/20 border border-(--border) rounded-lg hover:border-blue-500/50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">{log.type}</span>
                  <span className="text-xs text-gray-400">{log.date}</span>
                </div>
                <p className="text-sm text-gray-300">{log.summary}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
