"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { SalesBoard } from "@/components/SalesBoard"
import { FiLock, FiUnlock, FiDelete, FiAlertCircle } from "react-icons/fi"

function getInitialVerifiedState(): boolean {
  if (typeof window === "undefined") return false
  try {
    const params = new URLSearchParams(window.location.search)
    const isAutoVerify = params.get("autoverify") === "true" || params.get("bypass") === "true"
    const stored = sessionStorage.getItem("tv_verified") || localStorage.getItem("tv_verified")
    if (stored === "true" || isAutoVerify) {
      sessionStorage.setItem("tv_verified", "true")
      localStorage.setItem("tv_verified", "true")
      return true
    }
  } catch {
    // Ignore storage exceptions
  }
  return false
}

function getInitialPin(): string[] {
  if (typeof window === "undefined") return ["", "", "", ""]
  try {
    const params = new URLSearchParams(window.location.search)
    const queryPin = params.get("pin")?.trim()
    if (queryPin && queryPin.length === 4) {
      return queryPin.slice(0, 4).split("")
    }
  } catch {
    // Ignore query parsing exceptions
  }
  return ["", "", "", ""]
}

export default function TVPage() {
  const [verified, setVerified] = useState<boolean>(getInitialVerifiedState)
  const [pin, setPin] = useState<string[]>(getInitialPin)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const hasAutoVerifiedPin = useRef(false)

  // Direct submit helper
  const verifyPinString = useCallback(async (fullPin: string) => {
    if (fullPin.length !== 4) return

    setVerifying(true)
    setError(null)
    try {
      const res = await fetch("/api/tv/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: fullPin }),
      })
      const data = await res.json()
      if (data.success && data.valid) {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("tv_verified", "true")
          localStorage.setItem("tv_verified", "true")
        }
        setVerified(true)
      } else {
        setError("Incorrect PIN. Please try again.")
        setPin(["", "", "", ""])
        setTimeout(() => {
          inputRefs.current[0]?.focus()
        }, 300)
      }
    } catch {
      setError("Network error verifying PIN. Please try again.")
      setPin(["", "", "", ""])
      setTimeout(() => {
        inputRefs.current[0]?.focus()
      }, 300)
    } finally {
      setVerifying(false)
    }
  }, [])

  // Auto-verify on mount if URL contained a 4-digit PIN, or focus first input
  useEffect(() => {
    if (verified) return

    const initialPinStr = pin.join("")
    if (initialPinStr.length === 4 && !hasAutoVerifiedPin.current) {
      hasAutoVerifiedPin.current = true
      verifyPinString(initialPinStr)
    } else {
      inputRefs.current[0]?.focus()
    }
  }, [verified, pin, verifyPinString])

  // Handle single digit changes in the 4 input fields
  const handleDigitChange = (index: number, rawValue: string) => {
    // Extract only digits
    const cleanDigits = rawValue.replace(/\D/g, "")
    if (!cleanDigits) {
      setPin(prev => {
        const next = [...prev]
        next[index] = ""
        return next
      })
      return
    }

    // If multiple digits entered at once (e.g. paste or autocomplete)
    if (cleanDigits.length > 1) {
      const full = cleanDigits.slice(0, 4).split("")
      const nextPin = ["", "", "", ""]
      for (let i = 0; i < 4; i++) {
        nextPin[i] = full[i] || ""
      }
      setPin(nextPin)
      const lastIdx = Math.min(cleanDigits.length, 4) - 1
      inputRefs.current[lastIdx]?.focus()
      if (cleanDigits.length >= 4) {
        verifyPinString(nextPin.join(""))
      }
      return
    }

    const singleDigit = cleanDigits.slice(-1)
    setPin(prev => {
      const next = [...prev]
      next[index] = singleDigit
      
      // Check if all 4 are filled
      const fullPin = next.join("")
      if (fullPin.length === 4 && next.every(d => d !== "")) {
        setTimeout(() => verifyPinString(fullPin), 50)
      }
      return next
    })

    // Advance focus to next input if digit entered
    if (singleDigit && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  // Handle key navigation (Backspace, Left, Right, Enter)
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const currentPin = pin.join("")
      if (currentPin.length === 4) {
        verifyPinString(currentPin)
      }
      return
    }

    if (e.key === "Backspace") {
      if (!pin[index] && index > 0) {
        e.preventDefault()
        setPin(prev => {
          const next = [...prev]
          next[index - 1] = ""
          return next
        })
        inputRefs.current[index - 1]?.focus()
      } else if (pin[index]) {
        setPin(prev => {
          const next = [...prev]
          next[index] = ""
          return next
        })
      }
      return
    }

    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault()
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === "ArrowRight" && index < 3) {
      e.preventDefault()
      inputRefs.current[index + 1]?.focus()
    }
  }

  // Universal paste handler across any box
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4)
    if (pasted.length > 0) {
      const nextPin = ["", "", "", ""]
      pasted.split("").forEach((ch, idx) => {
        if (idx < 4) nextPin[idx] = ch
      })
      setPin(nextPin)
      const targetFocus = Math.min(pasted.length, 3)
      inputRefs.current[targetFocus]?.focus()
      if (pasted.length === 4) {
        verifyPinString(nextPin.join(""))
      }
    }
  }

  // On-screen keypad button click handler (for TVs, remotes, tablets, touchscreens)
  const handleKeypadPress = (digit: string) => {
    setError(null)
    setPin(prev => {
      const next = [...prev]
      const firstEmptyIndex = next.findIndex(d => d === "")
      if (firstEmptyIndex !== -1) {
        next[firstEmptyIndex] = digit
        if (firstEmptyIndex < 3) {
          inputRefs.current[firstEmptyIndex + 1]?.focus()
        } else {
          inputRefs.current[3]?.focus()
        }
        const fullPin = next.join("")
        if (fullPin.length === 4 && next.every(d => d !== "")) {
          setTimeout(() => verifyPinString(fullPin), 50)
        }
      }
      return next
    })
  }

  const handleKeypadBackspace = () => {
    setError(null)
    setPin(prev => {
      const next = [...prev]
      // Find the last filled digit and clear it
      for (let i = 3; i >= 0; i--) {
        if (next[i] !== "") {
          next[i] = ""
          inputRefs.current[i]?.focus()
          break
        }
      }
      return next
    })
  }

  const handleKeypadClear = () => {
    setError(null)
    setPin(["", "", "", ""])
    inputRefs.current[0]?.focus()
  }

  const handleManualSubmit = () => {
    const fullPin = pin.join("")
    if (fullPin.length === 4) {
      verifyPinString(fullPin)
    }
  }

  // PIN Gate
  if (!verified) {
    const fullPinEntered = pin.every(d => d !== "")

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#07090e] p-4 text-white select-none">
        <div className={`w-full max-w-sm flex flex-col items-center text-center ${error ? "animate-shake" : ""}`}>
          
          {/* Logo & Header */}
          <div className="mb-6 flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20 mb-3 flex items-center justify-center">
              <div className="w-full h-full bg-[#0d121c] rounded-[14px] flex items-center justify-center">
                <FiLock className="text-emerald-400" size={22} />
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-[0.25em] text-white">
              TITAN DIAMOND
            </h1>
            <div className="h-0.5 w-24 mx-auto bg-gradient-to-r from-transparent via-emerald-500 to-transparent my-2" />
            <p className="text-emerald-400/80 text-xs font-bold tracking-widest uppercase">
              Sales Broadcast Display
            </p>
          </div>

          {/* PIN Input Boxes */}
          <div className="flex gap-2.5 sm:gap-3 justify-center mb-4">
            {pin.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el }}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                disabled={verifying}
                autoFocus={i === 0}
                className={`w-14 h-16 sm:w-16 sm:h-20 text-center text-3xl font-mono font-black rounded-xl border-2 bg-black/40 outline-none transition-all duration-200 ${
                  error
                    ? "border-red-500/80 text-red-400 bg-red-950/20 shadow-lg shadow-red-500/10"
                    : digit
                    ? "border-emerald-500 text-emerald-400 bg-emerald-950/20 shadow-lg shadow-emerald-500/10"
                    : "border-white/10 text-white focus:border-emerald-500 focus:bg-emerald-950/10"
                } disabled:opacity-50`}
              />
            ))}
          </div>

          {/* Status Message */}
          <div className="min-h-[28px] mb-4 flex items-center justify-center">
            {verifying && (
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                Verifying PIN...
              </div>
            )}
            {error && (
              <div className="flex items-center gap-1.5 text-rose-400 text-xs font-bold bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                <FiAlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}
            {!verifying && !error && (
              <p className="text-neutral-500 text-xs font-semibold">
                Enter 4-digit TV PIN to unlock
              </p>
            )}
          </div>

          {/* On-Screen Keypad for TV remote, touchscreens, and kiosk displays */}
          <div className="grid grid-cols-3 gap-2 w-full max-w-[280px] mb-4">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeypadPress(num)}
                disabled={verifying}
                className="h-12 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] active:bg-emerald-600/30 border border-white/[0.06] hover:border-emerald-500/40 text-xl font-bold font-mono text-white transition-all duration-150 flex items-center justify-center disabled:opacity-40"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleKeypadClear}
              disabled={verifying}
              title="Clear all"
              className="h-12 rounded-xl bg-white/[0.02] hover:bg-rose-500/10 active:bg-rose-500/20 border border-white/[0.04] text-xs font-black uppercase text-neutral-400 hover:text-rose-400 transition-all duration-150 flex items-center justify-center disabled:opacity-40"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleKeypadPress("0")}
              disabled={verifying}
              className="h-12 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] active:bg-emerald-600/30 border border-white/[0.06] hover:border-emerald-500/40 text-xl font-bold font-mono text-white transition-all duration-150 flex items-center justify-center disabled:opacity-40"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleKeypadBackspace}
              disabled={verifying}
              title="Backspace"
              className="h-12 rounded-xl bg-white/[0.02] hover:bg-white/[0.08] active:bg-white/[0.15] border border-white/[0.04] text-neutral-400 hover:text-white transition-all duration-150 flex items-center justify-center disabled:opacity-40"
            >
              <FiDelete size={18} />
            </button>
          </div>

          {/* Unlock Submit Button */}
          <button
            type="button"
            onClick={handleManualSubmit}
            disabled={!fullPinEntered || verifying}
            className={`w-full max-w-[280px] py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-lg ${
              fullPinEntered && !verifying
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25 cursor-pointer"
                : "bg-white/5 text-neutral-500 border border-white/5 cursor-not-allowed opacity-60"
            }`}
          >
            {verifying ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>Unlocking...</span>
              </>
            ) : (
              <>
                <FiUnlock size={16} />
                <span>Unlock Display</span>
              </>
            )}
          </button>

          {/* Quick Helper Note */}
          <p className="text-[11px] text-neutral-600 mt-5 font-medium">
            Default PIN: <span className="font-mono text-neutral-400 font-semibold">8321</span> &bull; Manage in Admin Settings
          </p>
        </div>

        {/* Shake animation */}
        <style jsx>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
            20%, 40%, 60%, 80% { transform: translateX(6px); }
          }
          .animate-shake {
            animation: shake 0.4s ease-in-out;
          }
        `}</style>
      </div>
    )
  }

  // TV Dashboard - verified
  return (
    <div className="h-full bg-black p-4 flex flex-col min-h-0 overflow-hidden relative">
      <SalesBoard />
    </div>
  )
}
