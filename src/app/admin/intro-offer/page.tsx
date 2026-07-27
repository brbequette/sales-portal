"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function AdminIntroOfferRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/intro-offer")
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        <p className="text-sm font-semibold text-neutral-400">Opening Standalone Intro Offer Page...</p>
      </div>
    </div>
  )
}
