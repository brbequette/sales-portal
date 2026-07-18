"use client"

import { useState, useEffect, useRef } from "react"
import { FiDatabase, FiCheckCircle, FiAlertTriangle, FiRefreshCw, FiPlay, FiPause, FiInfo, FiBox } from "react-icons/fi"

type Status = {
  checkpoint: any
  totals: { invoices: number; salesOrders: number; quotes: number; total: number }
  cached: { invoices: number; salesOrders: number; quotes: number; total: number }
  hasBookId: { invoices: number; salesOrders: number; quotes: number; total: number }
}

type BatchResult = {
  success: boolean
  phase: number
  done?: boolean
  callAgain?: boolean
  retryAfterMs?: number
  // Phase 1
  totalMapped?: number
  pageMapped?: number
  percentComplete?: number
  module?: string
  page?: number
  // Phase 2
  batchProcessed?: number
  batchErrors?: number
  offset?: number
  totalUncached?: number
  remaining?: number
  etaMinutesRemaining?: number
  mapped?: number
  message?: string
  error?: string
}

export default function BackfillPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [phase1Running, setPhase1Running] = useState(false)
  const [phase2Running, setPhase2Running] = useState(false)
  const [autoRun, setAutoRun] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [lastResult, setLastResult] = useState<BatchResult | null>(null)
  const autoRunRef = useRef(false)
  const logRef = useRef<HTMLDivElement>(null)

  const addLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString()
    setLog(prev => [`[${ts}] ${msg}`, ...prev].slice(0, 200))
  }

  // Safe JSON parse — guards against empty body (e.g. function timeout)
  const safeJson = async (res: Response): Promise<any> => {
    const text = await res.text()
    if (!text || text.trim() === '') throw new Error(`Empty response (HTTP ${res.status}) — function may have timed out`)
    try { return JSON.parse(text) } catch { throw new Error(`Invalid JSON (HTTP ${res.status}): ${text.slice(0, 120)}`) }
  }

  const fetchStatus = async () => {
    setLoadingStatus(true)
    try {
      const res = await fetch("/api/backfill-books-data?status=1")
      const data = await safeJson(res)
      setStatus(data)
    } catch (e) {
      addLog("❌ Failed to fetch status")
    } finally {
      setLoadingStatus(false)
    }
  }

  useEffect(() => { fetchStatus() }, [])

  const phase1AutoRef = useRef(false)

  const runPhase1 = async () => {
    setPhase1Running(true)
    phase1AutoRef.current = true
    addLog("▶ Phase 1 starting — processing one Zoho page per call, auto-continuing...")

    while (phase1AutoRef.current) {
      try {
        const res = await fetch("/api/backfill-books-data?phase=1")
        const data: BatchResult = await safeJson(res)
        setLastResult(data)

        if (data.error) {
          addLog(`❌ Phase 1 error: ${data.error}`)
          break
        }

        addLog(
          data.done
            ? `🎉 Phase 1 complete! ${data.totalMapped} IDs mapped.`
            : `📄 ${data.module} pg ${data.page}: +${data.pageMapped} mapped · ${data.percentComplete}% done`
        )

        if (data.done || !data.callAgain) break
        // Small pause between calls
        await new Promise(r => setTimeout(r, 300))
      } catch (e: any) {
        addLog(`❌ Phase 1 error: ${e.message}`)
        break
      }
    }

    phase1AutoRef.current = false
    setPhase1Running(false)
    await fetchStatus()
  }

  const stopPhase1 = () => {
    phase1AutoRef.current = false
    addLog("⏹ Phase 1 stopping after current page...")
  }

  const runPhase2Batch = async (): Promise<BatchResult | null> => {
    try {
      const res = await fetch("/api/backfill-books-data?phase=2")
      const data: BatchResult = await safeJson(res)
      setLastResult(data)
      addLog(
        data.done
          ? `🎉 DONE! All records backfilled.`
          : `✅ Batch: +${data.batchProcessed} cached (${data.batchErrors || 0} errors) · ${data.percentComplete}% · ${data.remaining} left · ~${data.etaMinutesRemaining}m remaining`
      )
      return data
    } catch (e: any) {
      addLog(`❌ Phase 2 batch error: ${e.message}`)
      return null
    }
  }

  const startPhase2Auto = async () => {
    setPhase2Running(true)
    setAutoRun(true)
    autoRunRef.current = true
    addLog("▶ Starting Phase 2 auto-run (will continue until complete or stopped)...")

    let consecutiveErrors = 0
    const MAX_CONSECUTIVE_ERRORS = 3

    while (autoRunRef.current) {
      try {
        const res = await fetch("/api/backfill-books-data?phase=2")
        const data: BatchResult = await safeJson(res)
        setLastResult(data)


        if (data.error) {
          consecutiveErrors++
          addLog(`❌ Batch error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${data.error}`)
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            addLog(`⛔ ${MAX_CONSECUTIVE_ERRORS} consecutive errors — stopping. Click Resume to try again.`)
            break
          }
          await new Promise(r => setTimeout(r, 3000 * consecutiveErrors))
          continue
        }

        // Success — reset error counter
        consecutiveErrors = 0

        addLog(
          data.done
            ? `🎉 DONE! All records backfilled.`
            : `✅ Batch: +${data.batchProcessed} cached (${data.batchErrors || 0} errors) · ${data.percentComplete}% · ${data.remaining?.toLocaleString()} left · ~${data.etaMinutesRemaining}m remaining`
        )

        if (data.done || !data.callAgain) {
          addLog("🎉 Backfill complete!")
          break
        }

        // Small pause between batches
        await new Promise(r => setTimeout(r, 500))

      } catch (e: any) {
        consecutiveErrors++
        addLog(`❌ Network error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${e.message}`)
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          addLog(`⛔ ${MAX_CONSECUTIVE_ERRORS} consecutive errors — stopping. Click Resume to try again.`)
          break
        }
        // Exponential backoff on network errors
        await new Promise(r => setTimeout(r, 5000 * consecutiveErrors))
      }
    }

    autoRunRef.current = false
    setAutoRun(false)
    setPhase2Running(false)
    await fetchStatus()
  }

  const stopPhase2 = () => {
    autoRunRef.current = false
    addLog("⏹ Stopping after current batch completes...")
  }

  const resetPhase2 = async () => {
    if (!confirm("Reset Phase 2 checkpoint to 0? This will restart from the beginning.")) return
    await fetch("/api/backfill-books-data?phase=2&reset=1")
    addLog("🔄 Phase 2 checkpoint reset to 0.")
    await fetchStatus()
  }

  const pct = status
    ? Math.round((status.cached.total / Math.max(1, status.totals.total)) * 100)
    : 0

  const phase1Done = status?.checkpoint?.phase1Done === true
  const needsPhase1 = status && status.hasBookId.total < status.totals.invoices

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <FiDatabase className="text-amber-400" />
            Books Data Backfill
          </h1>
          <p className="text-neutral-400 text-sm mt-1">
            One-time operation to populate line items for all {status?.totals.total.toLocaleString() || '…'} local records
          </p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loadingStatus}
          className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition-colors"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Status Grid */}
      {status && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Total Records", value: status.totals.total.toLocaleString(), sub: `${status.totals.invoices} inv · ${status.totals.salesOrders} SO · ${status.totals.quotes} quotes`, color: "border-neutral-700" },
            { label: "Have Books ID", value: status.hasBookId.total.toLocaleString(), sub: `${Math.round(status.hasBookId.total / Math.max(1, status.totals.total) * 100)}% of records`, color: "border-sky-700" },
            { label: "Fully Cached", value: status.cached.total.toLocaleString(), sub: `${pct}% complete`, color: "border-emerald-700" },
            { label: "Still Needed", value: Math.max(0, status.totals.total - status.cached.total).toLocaleString(), sub: `${status.totals.total - status.hasBookId.total} missing Books ID`, color: "border-amber-700" },
          ].map(stat => (
            <div key={stat.label} className={`bg-neutral-900 border ${stat.color} rounded-xl p-4`}>
              <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider">{stat.label}</p>
              <p className="text-2xl font-black text-white mt-1">{stat.value}</p>
              <p className="text-xs text-neutral-400 mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Progress Bar */}
      {status && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-xs text-neutral-400">
            <span>Overall Progress</span>
            <span className="font-bold text-white">{pct}%</span>
          </div>
          <div className="w-full bg-neutral-800 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500 rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-neutral-500">
            {status.cached.total.toLocaleString()} of {status.totals.total.toLocaleString()} records have full line items cached
          </p>
        </div>
      )}

      {/* Steps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Phase 1 */}
        <div className={`bg-neutral-900 border rounded-xl p-5 space-y-3 ${phase1Done ? 'border-emerald-800' : 'border-neutral-700'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${phase1Done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>1</span>
              <div>
                <h3 className="font-bold text-white text-sm">Map Zoho Books IDs</h3>
                <p className="text-xs text-neutral-400">~80 API calls · ~3 minutes</p>
              </div>
            </div>
            {phase1Done && <FiCheckCircle className="text-emerald-400 w-5 h-5 shrink-0" />}
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Enumerates all Zoho Books invoices, SOs, and estimates (200/page) and writes their Books ID into local records.
            Required before Phase 2 — without it, Phase 2 needs 2 API calls per record instead of 1.
          </p>
          {status && (
            <div className="text-xs text-neutral-500 bg-neutral-800 rounded-lg px-3 py-2">
              Invoices with Books ID: <span className="text-white font-bold">{status.hasBookId.invoices.toLocaleString()}</span> / {status.totals.invoices.toLocaleString()} ·
              SOs: <span className="text-white font-bold">{status.hasBookId.salesOrders.toLocaleString()}</span> / {status.totals.salesOrders.toLocaleString()} ·
              Quotes: <span className="text-white font-bold">{status.hasBookId.quotes.toLocaleString()}</span> / {status.totals.quotes.toLocaleString()}
            </div>
          )}
          <div className="flex gap-2">
            {!phase1Running ? (
              <button
                onClick={runPhase1}
                disabled={phase2Running}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors"
              >
                <FiPlay size={14} /> {phase1Done ? 'Re-run Phase 1' : 'Run Phase 1'}
              </button>
            ) : (
              <button
                onClick={stopPhase1}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-bold text-sm transition-colors"
              >
                <FiPause size={14} /> Stop After Page
              </button>
            )}
          </div>
        </div>

        {/* Phase 2 */}
        <div className={`bg-neutral-900 border rounded-xl p-5 space-y-3 ${status?.checkpoint?.phase2Done ? 'border-emerald-800' : 'border-neutral-700'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${status?.checkpoint?.phase2Done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-sky-500/20 text-sky-400'}`}>2</span>
              <div>
                <h3 className="font-bold text-white text-sm">Fetch All Line Items</h3>
                <p className="text-xs text-neutral-400">~15,500 API calls · 3–8 hours total · auto-continues</p>
              </div>
            </div>
            {status?.checkpoint?.phase2Done && <FiCheckCircle className="text-emerald-400 w-5 h-5 shrink-0" />}
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Fetches full details (line items, custom fields, balance) for every uncached record.
            Rate-limited to 50 calls/min. Runs in batches of {18} — click Start and leave this tab open. Progress saves automatically.
          </p>
          {lastResult && lastResult.phase === 2 && (
            <div className="text-xs bg-neutral-800 rounded-lg px-3 py-2 space-y-1">
              <div className="flex justify-between">
                <span className="text-neutral-400">Progress</span>
                <span className="text-white font-bold">{lastResult.percentComplete}%</span>
              </div>
              <div className="w-full bg-neutral-700 rounded-full h-1.5">
                <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${lastResult.percentComplete}%` }} />
              </div>
              <div className="flex justify-between text-neutral-500">
                <span>{lastResult.remaining?.toLocaleString()} remaining</span>
                <span>~{lastResult.etaMinutesRemaining}m left</span>
              </div>
            </div>
          )}
          {status?.checkpoint?.phase2Offset > 0 && !status?.checkpoint?.phase2Done && (
            <p className="text-xs text-sky-400">
              Checkpoint saved at offset {status?.checkpoint?.phase2Offset} — will resume from here.
            </p>
          )}
          <div className="flex gap-2">
            {!phase2Running ? (
              <button
                onClick={startPhase2Auto}
                disabled={phase1Running || phase2Running}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors"
              >
                <FiPlay size={14} /> {status?.checkpoint?.phase2Offset > 0 ? 'Resume Phase 2' : 'Start Phase 2'}
              </button>
            ) : (
              <button
                onClick={stopPhase2}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-bold text-sm transition-colors"
              >
                <FiPause size={14} /> Stop After Batch
              </button>
            )}
            <button
              onClick={resetPhase2}
              disabled={phase2Running}
              title="Reset checkpoint to restart from beginning"
              className="px-3 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white text-sm transition-colors border border-neutral-700"
            >
              <FiRefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4 flex gap-3">
        <FiInfo className="text-amber-400 shrink-0 mt-0.5" size={16} />
        <div className="text-xs text-amber-200/80 space-y-1">
          <p><strong>Run Phase 1 first</strong> — it maps 7,615 invoice Books IDs and will find SO/Quote IDs too. Takes ~3 minutes.</p>
          <p><strong>Phase 2 is safe to stop and restart</strong> — progress is saved after every batch of 18 records. Close the tab and come back anytime.</p>
          <p><strong>Leave this tab open during Phase 2.</strong> Each batch takes ~25 seconds. The page auto-continues until all records are done or you click Stop.</p>
          <p><strong>After Phase 2:</strong> the <strong>Product Buyer Search</strong> filter on the dashboard will work for all accounts, and all invoice modals will load instantly from cache.</p>
        </div>
      </div>

      {/* Log */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Activity Log</h3>
          <button onClick={() => setLog([])} className="text-xs text-neutral-500 hover:text-neutral-300">Clear</button>
        </div>
        <div ref={logRef} className="p-4 h-64 overflow-y-auto font-mono text-xs text-neutral-400 space-y-1 flex flex-col-reverse">
          {log.length === 0
            ? <p className="text-neutral-600">No activity yet. Run Phase 1 to start.</p>
            : log.map((line, i) => (
              <p key={i} className={line.includes('❌') ? 'text-rose-400' : line.includes('✅') || line.includes('🎉') ? 'text-emerald-400' : 'text-neutral-400'}>
                {line}
              </p>
            ))
          }
        </div>
      </div>
    </div>
  )
}
