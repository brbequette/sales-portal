"use client"

import { useState } from "react"

export function SalesAssistant({ accountId, accountData }: { accountId: string, accountData?: any }) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [script, setScript] = useState<string | null>(null)
  const [callType, setCallType] = useState<string>("Standard")

  const handleGenerateScript = async () => {
    setIsGenerating(true)
    try {
      const response = await fetch('/api/ai/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: accountData?.name || "Acme Corporation",
          industry: accountData?.industry || "Manufacturing",
          status: accountData?.status || "Update Status",
          quality: accountData?.quality || "NEVER_STATUSED",
          tags: accountData?.tags,
          lastPurchase: accountData?.lastPurchaseAt || "2024-05-12",
          callType: callType,
          daysSinceLastPurchase: accountData?.daysSinceLastPurchase,
          totalRevenue: accountData?.totalRevenue,
          invoices: accountData?.invoices?.slice(0, 3), // Send top 3 for context
          primaryContact: accountData?.contacts?.find((c: any) => c.isPrimary) || accountData?.contacts?.[0],
          ownerName: accountData?.owner?.name
        })
      })
      const data = await response.json()
      if (data.success) {
        setScript(data.script)
      } else {
        setScript("Failed to generate script. Please try again.")
      }
    } catch (error) {
      console.error(error)
      setScript("An error occurred while communicating with the AI.")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-purple-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          AI Sales Assistant
        </h2>
        <div className="flex gap-2">
          <select 
            value={callType}
            onChange={(e) => setCallType(e.target.value)}
            className="text-xs bg-black/50 border border-(--border) text-gray-300 px-2 py-1.5 rounded focus:outline-none focus:border-purple-500"
          >
            <option value="Standard">Standard</option>
            <option value="Cold Call">Cold Call</option>
            <option value="Follow-up">Follow-up</option>
            <option value="Objection Handling">Objection Handling</option>
            <option value="Overdue Invoice">Overdue Invoice</option>
          </select>
          <button 
            onClick={handleGenerateScript}
            className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded transition-colors"
            disabled={isGenerating}
          >
            {isGenerating ? 'Analyzing...' : 'Generate Script'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 space-y-4">
        {/* Insights Card */}
        <div className="p-4 bg-purple-900/10 border border-purple-500/20 rounded-lg">
          <h3 className="text-sm font-bold text-purple-300 mb-2">Company Insights</h3>
          <ul className="text-sm space-y-2 text-gray-300">
            {accountData?.daysSinceLastPurchase > 365 ? (
              <li>&bull; Has not purchased in over a year ({accountData.daysSinceLastPurchase} days).</li>
            ) : (
              <li>&bull; Active buyer. Last purchase was {accountData?.daysSinceLastPurchase} days ago.</li>
            )}
            <li>&bull; Lifetime value is ${accountData?.totalRevenue?.toLocaleString() ?? 'N/A'}.</li>
            <li>&bull; {accountData?.invoices?.length ? `They typically buy ${accountData.invoices?.[0]?.items?.length ?? 'multiple'} items per order.` : 'No past order history available.'}</li>
          </ul>
        </div>

        {/* Script Card */}
        <div className="p-4 bg-black/40 border border-neutral-700 rounded-lg flex-1 flex flex-col min-h-0">
          <h3 className="text-sm font-bold text-gray-200 mb-2">Suggested Sales Script</h3>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
          {isGenerating ? (
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-(--border) rounded w-3/4"></div>
              <div className="h-4 bg-(--border) rounded w-1/2"></div>
              <div className="h-4 bg-(--border) rounded w-5/6"></div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic leading-relaxed whitespace-pre-wrap">
              {script || "Click 'Generate Script' to create a customized pitch for this account."}
            </p>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
