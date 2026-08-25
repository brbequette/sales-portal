"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { getSession } from "next-auth/react"

function safeCallbackPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard"
  return value
}

function AuthCompletion() {
  const searchParams = useSearchParams()
  const [message, setMessage] = useState("Finishing your secure sign-in…")

  useEffect(() => {
    let cancelled = false
    const destination = safeCallbackPath(searchParams.get("callbackUrl"))

    async function finishSignIn() {
      for (let attempt = 0; attempt < 10 && !cancelled; attempt += 1) {
        const session = await getSession().catch(() => null)
        if (session) {
          window.location.replace(destination)
          return
        }
        await new Promise(resolve => window.setTimeout(resolve, 250))
      }

      if (!cancelled) {
        setMessage("Your sign-in could not be confirmed. Returning to login…")
        window.setTimeout(() => window.location.replace("/employee-login?error=SessionRequired"), 900)
      }
    }

    void finishSignIn()
    return () => { cancelled = true }
  }, [searchParams])

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-white">
      <div className="text-center">
        <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        <h1 className="text-lg font-black uppercase tracking-wide">Zoho sign-in complete</h1>
        <p className="mt-2 text-sm text-neutral-400">{message}</p>
      </div>
    </main>
  )
}

export default function AuthCompletePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-neutral-950" />}>
      <AuthCompletion />
    </Suspense>
  )
}
