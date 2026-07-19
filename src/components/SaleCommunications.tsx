"use client"

import { useState, useEffect } from "react"
import { FiPhone, FiMessageSquare, FiClock, FiPlay, FiCpu, FiRefreshCw } from "react-icons/fi"

interface SaleCommunicationsProps {
  zohoId: string
}

export function SaleCommunications({ zohoId }: SaleCommunicationsProps) {
  const [communications, setCommunications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)

  const fetchComms = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/get-sale-communications?zohoId=${encodeURIComponent(zohoId)}`)
      const data = await res.json()
      if (data.success) {
        setCommunications(data.communications || [])
      }
    } catch (err) {
      console.error("Failed to fetch communications:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchComms()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zohoId])

  const handleReevaluate = async (id: string) => {
    setAnalyzingId(id)
    try {
      const res = await fetch(`/api/calls/${id}/analyze`, { method: "POST" })
      const data = await res.json()
      if (data.success) {
        // Refresh comms to show new sentiment
        await fetchComms()
      } else {
        alert(data.error || "Failed to analyze call")
      }
    } catch (err) {
      console.error(err)
      alert("Error triggering analysis")
    } finally {
      setAnalyzingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (communications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-neutral-500 gap-3">
        <FiMessageSquare size={32} className="opacity-40" />
        <span className="text-sm font-semibold">No communications linked to this sale yet.</span>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {communications.map((comm) => (
        <div key={comm.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${comm.type === 'CALL' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                {comm.type === 'CALL' ? <FiPhone size={18} /> : <FiMessageSquare size={18} />}
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  {comm.type === 'CALL' ? 'Phone Call' : 'SMS Message'}
                  <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-bold ${
                    comm.direction === 'INBOUND' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {comm.direction}
                  </span>
                </div>
                <div className="text-xs text-neutral-400 mt-1 font-mono">
                  {comm.fromNumber} &rarr; {comm.toNumber}
                </div>
              </div>
            </div>
            <div className="text-xs text-neutral-500 flex items-center gap-1.5 font-semibold">
              <FiClock />
              {new Date(comm.createdAt).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
              })}
            </div>
          </div>

          {comm.type === 'CALL' && (
            <div className="mt-4 pt-4 border-t border-neutral-800">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Zoho Analysis */}
                <div className="bg-neutral-950 rounded-lg p-3 border border-neutral-800/50">
                  <div className="text-[10px] uppercase font-bold tracking-widest text-neutral-500 mb-2">Zoho Voice Original</div>
                  <div className="text-xs text-neutral-300">
                    <span className="font-semibold text-white">Sentiment:</span> {comm.zohoSentiment || 'Unknown'}
                  </div>
                  {comm.duration > 0 && (
                    <div className="text-xs text-neutral-400 mt-1">
                      Duration: {Math.floor(comm.duration / 60)}m {comm.duration % 60}s
                    </div>
                  )}
                  {comm.recordingUrl && (
                    <a href={comm.recordingUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-sky-400 hover:text-sky-300 transition-colors bg-sky-500/10 hover:bg-sky-500/20 px-2 py-1.5 rounded">
                      <FiPlay /> Play Recording
                    </a>
                  )}
                </div>

                {/* AI Re-Evaluation */}
                <div className="bg-neutral-950 rounded-lg p-3 border border-emerald-500/20 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
                  <div className="flex justify-between items-start mb-2 relative z-10">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-emerald-500 flex items-center gap-1.5">
                      <FiCpu size={12} /> Portal AI Analysis
                    </div>
                    <button
                      onClick={() => handleReevaluate(comm.id)}
                      disabled={analyzingId === comm.id}
                      className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2 py-1 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      {analyzingId === comm.id ? <FiRefreshCw className="animate-spin" /> : <FiRefreshCw />}
                      Re-Evaluate
                    </button>
                  </div>
                  <div className="relative z-10">
                    <div className="text-xs mb-1.5">
                      <span className="font-semibold text-white">Sentiment:</span>{' '}
                      <span className={`font-bold ${
                        comm.aiSentiment === 'Positive' ? 'text-emerald-400' :
                        comm.aiSentiment === 'Negative' ? 'text-red-400' : 'text-amber-400'
                      }`}>
                        {comm.aiSentiment || 'Not Analyzed'}
                      </span>
                    </div>
                    {comm.aiSummary && (
                      <div className="text-xs text-neutral-300 leading-relaxed italic bg-neutral-900/50 p-2 rounded">
                        &quot;{comm.aiSummary}&quot;
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {comm.type === 'SMS' && comm.body && (
            <div className="mt-3 pt-3 border-t border-neutral-800">
              <div className="text-sm text-neutral-200 whitespace-pre-wrap">{comm.body}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
