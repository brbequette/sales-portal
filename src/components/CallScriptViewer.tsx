"use client"
import { useState, useEffect } from "react"
import { useZoho } from "./ZohoProvider"
import { FiX, FiMessageCircle, FiChevronDown } from "react-icons/fi"

type CallScript = {
  id: string
  name: string
  callType: string
  content: string
}

export function CallScriptViewer({ accountId, accountProp, contact }: { accountId: string, accountProp?: any, contact: any }) {
  const { zohoContext: user } = useZoho()
  const [scripts, setScripts] = useState<CallScript[]>([])
  const [selectedScript, setSelectedScript] = useState<CallScript | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [account, setAccount] = useState<any>(accountProp)

  useEffect(() => {
    if (!accountProp && accountId) {
      fetch(`/api/get-zoho-account?id=${accountId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data?.[0]) setAccount(data.data[0])
        })
    }
  }, [accountId, accountProp])

  useEffect(() => {
    fetch('/api/scripts')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.scripts) {
          setScripts(data.scripts)
        }
      })
      .catch(console.error)
  }, [])

  if (scripts.length === 0) return null

  const applyMergeFields = (content: string) => {
    let parsed = content
    parsed = parsed.replace(/{{AccountName}}/g, account?.name || "[Account Name]")
    parsed = parsed.replace(/{{ContactName}}/g, contact?.firstName ? `${contact.firstName} ${contact.lastName || ''}`.trim() : "[Contact Name]")
    parsed = parsed.replace(/{{RepName}}/g, user?.name || "[Your Name]")
    parsed = parsed.replace(/{{Industry}}/g, account?.industry || "[Industry]")
    parsed = parsed.replace(/{{Status}}/g, account?.status || "[Status]")
    parsed = parsed.replace(/{{LastPurchase}}/g, account?.lastPurchaseAt ? new Date(account.lastPurchaseAt).toLocaleDateString() : "[Never]")
    parsed = parsed.replace(/{{CurrentSupplier}}/g, account?.currentSupplier || "[Unknown Supplier]")
    return parsed
  }

  return (
    <div className="mt-4 border border-blue-900/30 rounded-xl overflow-hidden bg-blue-950/10">
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="w-full flex items-center justify-between p-3 bg-blue-900/20 hover:bg-blue-900/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
          <FiMessageCircle /> Call Scripts
        </div>
        <FiChevronDown className={`text-blue-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="p-4 space-y-4">
          <select 
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-sm focus:outline-none focus:border-blue-500 text-white"
            onChange={e => setSelectedScript(scripts.find(s => s.id === e.target.value) || null)}
            value={selectedScript?.id || ""}
          >
            <option value="">-- Select a script --</option>
            {scripts.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.callType})</option>
            ))}
          </select>

          {selectedScript && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 shadow-inner max-h-48 overflow-y-auto scrollbar-thin">
              <p className="text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
                {applyMergeFields(selectedScript.content)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
