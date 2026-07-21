"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { SalesBoard } from "@/components/SalesBoard"

export default function TVPage() {
  const [verified, setVerified] = useState(false)
  const [checking, setChecking] = useState(true)
  const [pin, setPin] = useState(["", "", "", ""])
  const [error, setError] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Check sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("tv_verified")
    if (stored === "true") {
      setVerified(true)
    }
    setChecking(false)
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
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className={`text-center ${error ? "animate-shake" : ""}`}>
          {/* Logo */}
          <div className="mb-8">
            <h1 className="text-4xl font-black tracking-[0.3em] text-white mb-2">
              TITAN DIAMOND
            </h1>
            <div className="h-px w-32 mx-auto bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />
            <p className="text-neutral-500 text-sm font-bold tracking-widest uppercase mt-4">
              Sales Dashboard
            </p>
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
                className={`w-16 h-20 text-center text-3xl font-mono font-bold rounded-xl border-2 bg-black/20 outline-none transition-all duration-200 ${
                  error
                    ? "border-red-500 text-red-400"
                    : digit
                    ? "border-emerald-500 text-emerald-400"
                    : "border-neutral-700 text-white focus:border-emerald-500"
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
            <p className="text-neutral-600 text-xs font-semibold">
              Enter 4-digit PIN to continue
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
    <div className="min-h-screen bg-black">
      <SalesBoard />
    </div>
  )
}

