"use client"
import React, { useEffect, useState } from "react"
import { useZoho } from "@/components/ZohoProvider"
import { useRouter } from "next/navigation"

export default function CommunicationsDashboard() {
  const { isInitialized, zohoContext: currentUser } = useZoho()
  const router = useRouter()
  
  const [callLogs, setCallLogs] = useState<any[]>([])
  const [smsLogs, setSmsLogs] = useState<any[]>([])
  const [zohoNumbers, setZohoNumbers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savingNumbers, setSavingNumbers] = useState(false)

  useEffect(() => {
    if (!isInitialized) return
    
    const role = currentUser?.role?.toUpperCase() || ""
    if (!role.includes("ADMIN") && !role.includes("MANAGER")) {
      router.push("/")
      return
    }

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/admin/communications?role=${encodeURIComponent(role)}`)
        const data = await res.json()
        if (data.success) {
          setCallLogs(data.callLogs || [])
          setSmsLogs(data.smsLogs || [])
        }

        const numRes = await fetch('/api/manage-zoho-numbers?action=list')
        const numData = await numRes.json()
        if (numData.success) {
          setZohoNumbers(numData.numbers || [])
        }
      } catch (err) {
        console.error("Failed to load communications", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [isInitialized, currentUser, router])

  const handleSaveNumbers = async () => {
    try {
      setSavingNumbers(true)
      const numRes = await fetch('/api/manage-zoho-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers: zohoNumbers })
      })
      const numData = await numRes.json()

      if (numData.success) {
        alert('Numbers saved successfully!')
      } else {
        alert('Error saving numbers: ' + numData.error)
      }
    } catch (e) {
      console.error(e)
      alert('Error saving numbers.')
    } finally {
      setSavingNumbers(false)
    }
  }

  if (!isInitialized || loading) {
    return <div className="p-8 text-slate-500">Loading communications...</div>
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Communications Dashboard</h1>

      {/* Zoho Phone Numbers */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col mb-8">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Zoho Phone Numbers</h2>
            <p className="text-sm text-slate-500">Manage phone numbers used for voice and SMS</p>
          </div>
          <button 
            onClick={() => setZohoNumbers([...zohoNumbers, { number: "", name: "", isDefault: false, assignedUserIds: [] }])}
            className="text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
          >
            + Add Number
          </button>
        </div>
        <div className="p-6 space-y-3">
          {zohoNumbers.map((num, i) => (
            <div key={i} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="flex-1">
                <input 
                  type="text"
                  placeholder="Phone Number (e.g. +18005550199)"
                  value={num.number}
                  onChange={(e) => {
                    const newNums = [...zohoNumbers]
                    newNums[i].number = e.target.value
                    setZohoNumbers(newNums)
                  }}
                  className="w-full bg-white border border-slate-200 rounded px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 mb-2"
                />
                <input 
                  type="text"
                  placeholder="Friendly Name (e.g. Main Line)"
                  value={num.name}
                  onChange={(e) => {
                    const newNums = [...zohoNumbers]
                    newNums[i].name = e.target.value
                    setZohoNumbers(newNums)
                  }}
                  className="w-full bg-white border border-slate-200 rounded px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
              
              <div className="flex items-center gap-4 shrink-0">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                  <input 
                    type="radio"
                    name="default_zoho_number"
                    checked={num.isDefault}
                    onChange={() => {
                      const newNums = zohoNumbers.map((n, idx) => ({ ...n, isDefault: idx === i }))
                      setZohoNumbers(newNums)
                    }}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                  />
                  Default
                </label>
                <button
                  onClick={() => setZohoNumbers(zohoNumbers.filter((_, idx) => idx !== i))}
                  className="text-red-500 hover:text-red-700 p-1 rounded transition-colors"
                  title="Remove Number"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                </button>
              </div>
            </div>
          ))}
          {zohoNumbers.length === 0 && (
            <div className="text-center py-6 border border-dashed border-slate-300 rounded-lg text-slate-500 text-sm">
              No Zoho numbers added yet.
            </div>
          )}
          
          <div className="flex justify-end pt-4">
            <button 
              onClick={handleSaveNumbers}
              disabled={savingNumbers}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {savingNumbers ? "Saving..." : "Save Numbers"}
            </button>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* Call Logs */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-800">Recent Call Logs</h2>
            <p className="text-sm text-slate-500">Tracked via Zoho Voice Softphone</p>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-100/50 text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Agent</th>
                  <th className="px-6 py-3 font-medium">Account</th>
                  <th className="px-6 py-3 font-medium">Direction</th>
                  <th className="px-6 py-3 font-medium">Duration</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {callLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-slate-600">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">{log.author?.name || log.author?.email}</td>
                    <td className="px-6 py-4 text-blue-600 font-medium">{log.account?.name}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${log.direction === 'INBOUND' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                        {log.direction}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{Math.floor(log.duration / 60)}m {log.duration % 60}s</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${log.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 truncate max-w-xs" title={log.notes || ''}>
                      {log.notes || '-'}
                    </td>
                  </tr>
                ))}
                {callLogs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">No call logs found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SMS Logs */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-800">Recent SMS Logs</h2>
            <p className="text-sm text-slate-500">Tracked via Zoho Voice SMS</p>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-100/50 text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Agent</th>
                  <th className="px-6 py-3 font-medium">Account</th>
                  <th className="px-6 py-3 font-medium">Direction</th>
                  <th className="px-6 py-3 font-medium">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {smsLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-slate-600">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">{log.author?.name || log.author?.email || 'System'}</td>
                    <td className="px-6 py-4 text-blue-600 font-medium">{log.account?.name}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${log.direction === 'INBOUND' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'}`}>
                        {log.direction}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 truncate max-w-xs" title={log.body}>
                      {log.body}
                    </td>
                  </tr>
                ))}
                {smsLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">No SMS logs found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
