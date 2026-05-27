"use client"

import { useZoho } from "@/components/ZohoProvider"
import { useEffect, useState } from "react"
import Link from "next/link"

export default function Home() {
  const { isInitialized, zohoContext } = useZoho()
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [apiError, setApiError] = useState<string | null>(null)

  useEffect(() => {
    // Read local user safely
    let localUser = null
    try {
      const localUserJson = localStorage.getItem("sales_portal_user")
      if (localUserJson) {
        localUser = JSON.parse(localUserJson)
        setCurrentUser(localUser)
      }
    } catch (e) {
      console.warn("Failed to read user from localStorage:", e)
    }

    // If Zoho is initialized and we have context, prioritize it
    if (isInitialized && zohoContext) {
      setCurrentUser(zohoContext)
    }
  }, [isInitialized, zohoContext])

  useEffect(() => {
    if (!currentUser) return

    const fetchAccounts = async () => {
      setLoading(true)
      try {
        const query = currentUser.id && !currentUser.id.includes("@")
          ? `zohoId=${encodeURIComponent(currentUser.id)}`
          : `email=${encodeURIComponent(currentUser.email || "")}`
          
        const res = await fetch(`/api/get-accounts?${query}`)
        const data = await res.json()
        if (data.success) {
          setAccounts(data.accounts || [])
        } else {
          setApiError(data.error || "Unknown API Error")
        }
      } catch (err: any) {
        console.error("Failed to load accounts:", err)
        setApiError(err.message || "Fetch failed")
      } finally {
        setLoading(false)
      }
    }

    fetchAccounts()
  }, [currentUser])

  return (
    <div className="min-h-screen p-8 bg-(--background) text-(--foreground)">
      <header className="mb-8 border-b border-(--border) pb-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-(--primary)">Titan Diamond - Sales Hub</h1>
        {currentUser && (
          <div className="text-right">
            <div className="text-sm font-semibold text-white">{currentUser.name}</div>
            <div className="text-xs text-gray-400">{currentUser.role}</div>
          </div>
        )}
      </header>

      <main className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="p-6 rounded-lg bg-(--card) text-(--card-foreground) border border-(--border) shadow-lg">
            <h2 className="text-xl font-semibold mb-4">Environment Status</h2>
            {isInitialized ? (
              <div className="space-y-2">
                <p className="text-(--success) font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-(--success)"></span>
                  Zoho Connected (Session Active)
                </p>
                <pre className="mt-4 p-4 bg-black/30 rounded text-sm overflow-x-auto border border-(--border)">
                  {JSON.stringify(currentUser, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-(--warning) font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-(--warning) animate-pulse"></span>
                Running Standalone (or initializing Zoho...)
              </p>
            )}
          </div>

          {/* New Analytics Widget */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-6 rounded-lg bg-(--card) text-(--card-foreground) border border-(--border) shadow-lg flex flex-col items-center justify-center text-center">
              <h3 className="text-sm text-gray-400 font-semibold mb-1">Total Revenue (YTD)</h3>
              <p className="text-3xl font-bold text-blue-400">$2.4M</p>
            </div>
            <div className="p-6 rounded-lg bg-(--card) text-(--card-foreground) border border-(--border) shadow-lg flex flex-col items-center justify-center text-center">
              <h3 className="text-sm text-gray-400 font-semibold mb-1">Open Quotes</h3>
              <p className="text-3xl font-bold text-purple-400">14</p>
            </div>
            <div className="p-6 rounded-lg bg-(--card) text-(--card-foreground) border border-(--border) shadow-lg flex flex-col items-center justify-center text-center">
              <h3 className="text-sm text-gray-400 font-semibold mb-1">Accounts Needing Follow-up</h3>
              <p className="text-3xl font-bold text-(--warning)">{accounts.filter(a => a.nextActionDate || a.status === 'Update Status').length}</p>
            </div>
          </div>
        </div>

        <div className="col-span-1 space-y-6">
           <div className="p-6 rounded-lg bg-(--card) text-(--card-foreground) border border-(--border) shadow-lg">
            <h2 className="text-xl font-semibold mb-2">My Assigned Accounts</h2>
            <p className="text-sm text-gray-400 mb-4">Manage your accounts and upcoming reminders.</p>
            
            <div className="mb-4">
              <input 
                type="text" 
                placeholder="Search accounts..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black/40 border border-(--border) rounded-lg p-2 text-sm focus:outline-none focus:border-(--primary)"
              />
            </div>
             
             {apiError && (
               <div className="p-4 bg-red-900/30 border border-red-500 rounded text-red-200 text-sm mb-4">
                 <strong>Error fetching accounts:</strong> {apiError}
               </div>
             )}

             {loading ? (
               <div className="py-8 text-center border border-dashed border-(--border) rounded">
                  <p className="text-gray-500 animate-pulse">Loading accounts...</p>
               </div>
             ) : (
                <div className="space-y-3">
                  {accounts.filter(acc => acc.name.toLowerCase().includes(searchTerm.toLowerCase())).map((acc: any) => (
                    <Link
                      key={acc.id}
                      href={`/account?id=${acc.zohoId}`}
                      className="block p-4 bg-black/20 hover:bg-black/40 border border-(--border) rounded-lg transition-all hover:scale-[1.01] hover:border-(--primary)/50 relative"
                    >
                      {acc.nextActionDate && (
                        <div className="absolute top-2 right-2 text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                          Follow-up
                        </div>
                      )}
                      <div className="font-semibold text-white pr-16">{acc.name}</div>
                      <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
                        <span>{acc.industry || "General"}</span>
                        <span className={`px-2 py-0.5 rounded font-medium ${
                          acc.status === 'Update Status' ? 'bg-(--warning)/20 text-(--warning)' : 'bg-(--success)/20 text-(--success)'
                        }`}>
                          {acc.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                  {accounts.filter(acc => acc.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                    <p className="text-gray-500 text-center py-8 border border-dashed border-(--border) rounded">No accounts match your search.</p>
                  )}
                </div>
             )}
           </div>
        </div>
      </main>
    </div>
  )
}
