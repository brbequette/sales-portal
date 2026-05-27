"use client"

import { useState } from "react"

export function CommunicationCenter({ accountId }: { accountId: string }) {
  const [note, setNote] = useState("")
  const [outcome, setOutcome] = useState("Connected")
  const [reminderDate, setReminderDate] = useState("")
  const [isCalling, setIsCalling] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const handleSaveLog = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/zoho-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'LOG_CALL',
          accountId,
          noteContent: `Outcome: ${outcome}\nNote: ${note}\nFollow-up: ${reminderDate || 'None'}`,
          sentiment: 'Neutral',
          reminderDate
        })
      })
      if (response.ok) {
        setNote("")
        setReminderDate("")
        alert("Call logged successfully!")
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      <h2 className="text-xl font-semibold mb-2 text-blue-400 flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
        Communication Center
      </h2>

      {/* Dialer */}
      <div className="p-4 bg-blue-900/10 border border-blue-500/30 rounded-lg flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-400">Primary Contact</div>
          <div className="font-bold text-lg">(555) 123-4567</div>
        </div>
        <button 
          onClick={() => setIsCalling(!isCalling)}
          className={`px-6 py-2 rounded font-bold transition-colors ${
            isCalling 
              ? 'bg-(--danger) hover:bg-red-600 text-white' 
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          {isCalling ? 'End Call' : 'Call via Zoho Voice'}
        </button>
      </div>

      {isCalling && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/50 rounded flex items-center gap-3 animate-pulse">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span className="text-sm text-blue-300">Call connected. Recording active...</span>
        </div>
      )}

      {/* Call Notes */}
      <div className="flex-1 flex flex-col space-y-3">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-xs font-semibold mb-1 block text-gray-300">Call Outcome</label>
            <select 
              value={outcome}
              onChange={e => setOutcome(e.target.value)}
              className="w-full bg-black/40 border border-(--border) rounded p-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="Connected">Connected</option>
              <option value="Left Voicemail">Left Voicemail</option>
              <option value="No Answer">No Answer</option>
              <option value="Gatekeeper">Gatekeeper Blocked</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold mb-1 block text-gray-300">Set Reminder</label>
            <input 
              type="date"
              value={reminderDate}
              onChange={e => setReminderDate(e.target.value)}
              className="w-full bg-black/40 border border-(--border) rounded p-2 text-sm focus:outline-none focus:border-blue-500 text-gray-300"
            />
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <label className="text-xs font-semibold mb-1 block text-gray-300">Call Notes & Next Steps</label>
          <textarea 
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full flex-1 bg-black/40 border border-(--border) rounded-lg p-3 text-sm focus:outline-none focus:border-(--primary) resize-none"
            placeholder="Type notes here during the call..."
          ></textarea>
        </div>
        <div className="mt-2 flex justify-end">
          <button 
            onClick={handleSaveLog}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Note & Log Call'}
          </button>
        </div>
      </div>
    </div>
  )
}
