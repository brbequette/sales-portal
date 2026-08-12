"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"

export function CustomerIdentityCallback() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (pathname === "/login" || !window.location.hash) return

    const hash = window.location.hash
    if (hash.includes("token")) {
      window.location.replace(`/login${hash}`)
    }
  }, [pathname, router])

  return null
}
