'use client'

import { useEffect } from 'react'

export default function ErrorBoundaryFallback({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Section error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
      <div className="glass-panel p-8 rounded-2xl text-center max-w-md">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">
          Something went wrong
        </h2>
        <p className="text-[var(--muted)] mb-6 text-sm">
          {error.message || 'An unexpected error occurred in this section.'}
        </p>
        <button
          onClick={reset}
          className="td-btn td-btn-primary px-6 py-2"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
