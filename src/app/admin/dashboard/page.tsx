"use client"

import { useRouter } from "next/navigation"
import { FiArrowLeft } from "react-icons/fi"

export default function SalesDashboardPage() {
  const router = useRouter()

  return (
    <div className="flex flex-col h-[100dvh] bg-neutral-900 text-white font-sans overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-white/10 bg-[#151618] shrink-0">
        <button
          onClick={() => router.push('/admin')}
          className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
        >
          <FiArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Sales Dashboard</h1>
          <p className="text-xs text-neutral-500">Titan Diamond Sales Monitor</p>
        </div>
      </div>

      {/* Embedded App */}
      <main className="flex-1 w-full bg-neutral-950 relative">
        <iframe 
          src="https://titan-diamond-sales-monitor.netlify.app"
          className="absolute inset-0 w-full h-full border-0"
          title="Sales Dashboard"
          allow="fullscreen"
        />
      </main>
    </div>
  )
}
