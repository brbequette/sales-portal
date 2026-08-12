"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { handleAuthCallback } from "@netlify/identity"

const LOGIN_CALLBACKS = ["recovery_token", "invite_token"]
const ACCOUNT_CALLBACKS = ["confirmation_token", "access_token", "email_change_token"]

export function CustomerIdentityCallback() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (pathname === "/login" || !window.location.hash) return

    const hash = window.location.hash
    if (LOGIN_CALLBACKS.some((token) => hash.includes(token))) {
      window.location.replace(`/login${hash}`)
      return
    }

    if (!ACCOUNT_CALLBACKS.some((token) => hash.includes(token))) return

    handleAuthCallback()
      .then((result) => {
        if (result?.user) router.replace("/customer-portal")
      })
      .catch(() => router.replace("/login?error=callback"))
  }, [pathname, router])

  return null
}
