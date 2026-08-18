"use client"


import { useEffect, useState } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [isDebug, setIsDebug] = useState(false)

  useEffect(() => {
    console.error("App Error:", error)
    try {
      setIsDebug(sessionStorage.getItem('titan_debug_mode') === '1')
    } catch {}
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-black/20 text-white p-6">
      <div className="max-w-md w-full glass-panel border border-white/10 rounded-2xl p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Something went wrong</h2>
        <p className="text-sm text-neutral-400 mb-4">{error.message || "An unexpected error occurred loading the portal."}</p>

        {isDebug && (
          <div className="text-left mb-4 p-3 bg-neutral-900/80 border border-white/5 rounded-xl overflow-x-auto">
            <div className="text-[10px] font-mono text-red-400 mb-1">{error.name}: {error.message}</div>
            {error.digest && (
              <div className="text-[10px] font-mono text-amber-400 mb-1">Digest: {error.digest}</div>
            )}
            {error.stack && (
              <pre className="text-[9px] font-mono text-neutral-500 whitespace-pre-wrap break-all mt-2 max-h-[200px] overflow-y-auto">
                {error.stack}
              </pre>
            )}
          </div>
        )}

        <button
          onClick={reset}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}

