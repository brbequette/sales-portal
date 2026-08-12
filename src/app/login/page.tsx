"use client"

import { FormEvent, Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AuthError,
  MissingIdentityError,
  acceptInvite,
  getUser,
  handleAuthCallback,
  login,
  requestPasswordRecovery,
  signup,
  updateUser,
} from "@netlify/identity"
import { FiAlertCircle, FiArrowRight, FiCheckCircle, FiLock, FiMail, FiUser } from "react-icons/fi"

type Mode = "login" | "signup" | "recover" | "reset"

function getErrorMessage(error: unknown) {
  if (error instanceof MissingIdentityError) {
    return "Customer accounts are temporarily unavailable. Please contact support."
  }

  if (error instanceof AuthError) {
    if (error.status === 401) return "Invalid email or password."
    if (error.status === 403) return "Customer registration is not currently available."
    if (error.status === 422) return "Please check the information you entered."
    return error.message
  }

  return "Unable to complete the request. Please try again."
}

function CustomerLoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<Mode>("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [inviteToken, setInviteToken] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    let active = true

    async function initialize() {
      try {
        if (searchParams.get("error") === "callback") {
          setError("The secure account link is invalid or has expired.")
        }
        const callback = await handleAuthCallback()
        if (!active) return

        if (callback?.type === "recovery" || callback?.type === "invite") {
          setMode("reset")
          setInviteToken(callback.type === "invite" ? callback.token || "" : "")
          setMessage(callback.type === "invite" ? "Create a password to finish setting up your account." : "Enter a new password for your account.")
          return
        }

        const user = await getUser()
        if (user) router.replace("/customer-portal")
      } catch (callbackError) {
        if (active) setError(getErrorMessage(callbackError))
      } finally {
        if (active) setLoading(false)
      }
    }

    initialize()
    return () => { active = false }
  }, [router, searchParams])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    setMessage("")
    setLoading(true)

    try {
      if (mode === "recover") {
        await requestPasswordRecovery(email.trim().toLowerCase())
        setMessage("Check your email for a secure password reset link.")
        return
      }

      if (mode === "signup") {
        if (password !== confirmPassword) throw new Error("Passwords do not match.")
        const user = await signup(email.trim().toLowerCase(), password, { full_name: name.trim() })
        if (user.confirmedAt) {
          router.push("/customer-portal")
        } else {
          setMessage("Account created. Check your email to confirm your address before signing in.")
          setMode("login")
        }
        return
      }

      if (mode === "reset") {
        if (password !== confirmPassword) throw new Error("Passwords do not match.")
        if (inviteToken) {
          await acceptInvite(inviteToken, password)
        } else {
          await updateUser({ password })
        }
        router.push("/customer-portal")
        return
      }

      await login(email.trim().toLowerCase(), password)
      router.push("/customer-portal")
    } catch (submitError) {
      setError(submitError instanceof Error && submitError.message === "Passwords do not match."
        ? submitError.message
        : getErrorMessage(submitError))
    } finally {
      setLoading(false)
    }
  }

  const setFormMode = (nextMode: Mode) => {
    setMode(nextMode)
    setError("")
    setMessage("")
    setPassword("")
    setConfirmPassword("")
  }

  return (
    <main className="min-h-screen bg-[#07090d] text-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-amber-500/10 blur-[120px]" />
      <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-sky-500/10 blur-[120px]" />

      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-950/85 p-7 sm:p-9 shadow-2xl backdrop-blur-xl relative z-10">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 text-2xl font-black text-neutral-950 shadow-[0_0_35px_rgba(245,158,11,0.25)]">T</div>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-400">Customer Account</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight">
            {mode === "signup" ? "Create your account" : mode === "recover" ? "Reset your password" : mode === "reset" ? "Choose a new password" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-neutral-400">Orders, pricing, invoices, and support in one secure place.</p>
        </div>

        {error && <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><FiAlertCircle className="mt-0.5 shrink-0" />{error}</div>}
        {message && <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300"><FiCheckCircle className="mt-0.5 shrink-0" />{message}</div>}

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-neutral-400">Name</span>
              <span className="relative block"><FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" /><input value={name} onChange={(event) => setName(event.target.value)} required className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-amber-500" placeholder="Your full name" /></span>
            </label>
          )}

          {mode !== "reset" && (
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-neutral-400">Email</span>
              <span className="relative block"><FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-amber-500" placeholder="you@company.com" /></span>
            </label>
          )}

          {mode !== "recover" && (
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-neutral-400">{mode === "reset" ? "New password" : "Password"}</span>
              <span className="relative block"><FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-amber-500" placeholder="At least 8 characters" /></span>
            </label>
          )}

          {(mode === "signup" || mode === "reset") && (
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-neutral-400">Confirm password</span>
              <span className="relative block"><FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" /><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-amber-500" placeholder="Repeat your password" /></span>
            </label>
          )}

          <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-3.5 text-sm font-black text-neutral-950 transition hover:from-amber-400 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "Please wait..." : mode === "signup" ? "Create Customer Account" : mode === "recover" ? "Send Reset Link" : mode === "reset" ? "Save New Password" : "Sign In to Customer Portal"}
            {!loading && <FiArrowRight />}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-center gap-3 text-xs text-neutral-400">
          {mode === "login" ? <><button onClick={() => setFormMode("recover")} className="hover:text-amber-400">Forgot password?</button><span className="text-neutral-700">•</span><button onClick={() => setFormMode("signup")} className="hover:text-amber-400">Create account</button></> : <button onClick={() => setFormMode("login")} className="hover:text-amber-400">Back to customer sign in</button>}
        </div>

        <div className="mt-7 border-t border-white/10 pt-5 text-center text-xs text-neutral-500">
          Titan team member? <Link href="/employee-login" className="font-semibold text-emerald-400 hover:text-emerald-300">Use employee login</Link>
        </div>
      </div>
    </main>
  )
}

export default function CustomerLoginPage() {
  return <Suspense><CustomerLoginContent /></Suspense>
}
