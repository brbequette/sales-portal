"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { FutureSalesBoard } from "@/components/FutureSalesBoard"

export default function TVPage() {
  const [verified, setVerified] = useState(false)
  const [checking, setChecking] = useState(true)
  const [pin, setPin] = useState(["", "", "", ""])
  const [error, setError] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // A local marker improves UX, but the server-issued TV cookie is authoritative.
  useEffect(() => {
    const restoreVerification = async () => {
      const stored = sessionStorage.getItem("tv_verified") || localStorage.getItem("tv_verified")
      if (stored === "true") {
        const response = await fetch('/api/tv/verify-pin').catch(() => null)
        const result = response?.ok ? await response.json().catch(() => null) : null
        if (result?.valid) {
          sessionStorage.setItem("tv_verified", "true")
          localStorage.setItem("tv_verified", "true")
          setVerified(true)
        } else {
          sessionStorage.removeItem("tv_verified")
          localStorage.removeItem("tv_verified")
        }
      }
      setChecking(false)
    }
    restoreVerification()
  }, [])

  const submitPin = useCallback(async (digits: string[]) => {
    const fullPin = digits.join("")
    if (fullPin.length !== 4) return

    setVerifying(true)
    setError(false)
    try {
      const res = await fetch("/api/tv/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: fullPin }),
      })
      const data = await res.json()
      if (data.success && data.valid) {
        sessionStorage.setItem("tv_verified", "true")
        localStorage.setItem("tv_verified", "true")
        setVerified(true)
      } else {
        setError(true)
        setPin(["", "", "", ""])
        setTimeout(() => {
          inputRefs.current[0]?.focus()
          setError(false)
        }, 600)
      }
    } catch {
      setError(true)
      setPin(["", "", "", ""])
      setTimeout(() => {
        inputRefs.current[0]?.focus()
        setError(false)
      }, 600)
    } finally {
      setVerifying(false)
    }
  }, [])

  const handleDigitChange = (index: number, value: string) => {
    // Only allow single digit
    const digit = value.replace(/\D/g, "").slice(-1)
    const newPin = [...pin]
    newPin[index] = digit
    setPin(newPin)

    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all 4 digits filled
    if (digit && index === 3 && newPin.every((d) => d !== "")) {
      submitPin(newPin)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4)
    if (pasted.length === 4) {
      const newPin = pasted.split("")
      setPin(newPin)
      inputRefs.current[3]?.focus()
      submitPin(newPin)
    }
  }

  // Loading state
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // PIN Gate
  if (!verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#05080b] relative overflow-hidden">
        <div className="absolute inset-0 opacity-30 bg-[linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] bg-[size:52px_52px]" />
        <div className="absolute -top-[40vw] -right-[15vw] w-[75vw] h-[75vw] rounded-full bg-[radial-gradient(circle,rgba(52,211,153,.18),rgba(34,211,238,.05)_42%,transparent_68%)]" />
        <div className={`relative text-center w-full max-w-xl px-8 ${error ? "animate-shake" : ""}`}>
          {/* Logo */}
          <div className="mb-12">
            <img src="/images/brand/titan-diamond-2026.png" alt="Titan Diamond USA" className="w-full max-w-sm h-auto mx-auto mb-6 object-contain" />
            <p className="text-orange-400 text-xs sm:text-sm font-bold tracking-[0.35em] uppercase">
              Sales Intelligence
            </p>
            <div className="h-px w-48 mx-auto mt-6 bg-gradient-to-r from-transparent via-orange-500/80 to-transparent" />
          </div>

          {/* PIN Input */}
          <div className="flex gap-3 justify-center mb-6">
            {pin.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                disabled={verifying}
                autoFocus={i === 0}
                className={`w-14 h-18 sm:w-20 sm:h-24 text-center text-2xl sm:text-4xl font-mono font-bold rounded-2xl border bg-white/[.035] backdrop-blur-xl outline-none transition-all duration-300 ${
                  error
                    ? "border-red-400 text-red-300 shadow-[0_0_24px_rgba(248,113,113,.2)]"
                    : digit
                    ? "border-emerald-400/70 text-emerald-300 shadow-[0_0_24px_rgba(52,211,153,.16)]"
                    : "border-white/15 text-white focus:border-emerald-400/70 focus:bg-emerald-400/[.04]"
                } disabled:opacity-50`}
              />
            ))}
          </div>

          {/* Status */}
          {verifying && (
            <div className="flex items-center justify-center gap-2 text-neutral-400 text-sm">
              <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              Verifying...
            </div>
          )}
          {error && (
            <p className="text-red-400 text-sm font-bold">
              Incorrect PIN. Try again.
            </p>
          )}
          {!verifying && !error && (
            <p className="text-neutral-500 text-[11px] font-bold tracking-[0.22em] uppercase">
              Enter access code · Command display
            </p>
          )}
        </div>

        {/* Shake animation */}
        <style jsx>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
            20%, 40%, 60%, 80% { transform: translateX(6px); }
          }
          .animate-shake {
            animation: shake 0.5s ease-in-out;
          }
        `}</style>
      </div>
    )
  }

  // TV Dashboard - verified
  return (
    <div className="h-full bg-black p-1 sm:p-2 lg:p-4 flex flex-col min-h-0 overflow-hidden">
      <FutureSalesBoard />
    </div>
  )
}

