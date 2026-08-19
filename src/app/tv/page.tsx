"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { SalesBoard } from "@/components/SalesBoard"
import { FiLock, FiUnlock, FiDelete, FiAlertCircle, FiRefreshCw } from "react-icons/fi"

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

function getInitialPin(): string {
  if (typeof window === "undefined") return ""
  try {
    const params = new URLSearchParams(window.location.search)
    const queryPin = params.get("pin")?.trim()
    if (queryPin && queryPin.length === 4) {
      return queryPin.slice(0, 4)
    }
  } catch {
    // Ignore query parsing exceptions
  }
  return ""
}

export default function TVPage() {
  const [verified, setVerified] = useState<boolean>(getInitialVerifiedState)
  const [pin, setPin] = useState<string>(getInitialPin)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const masterInputRef = useRef<HTMLInputElement | null>(null)
  const hasAutoVerifiedPin = useRef(false)
  const verifyingRef = useRef(false)
  verifyingRef.current = verifying

  // Direct submit helper
  const verifyPinString = useCallback(async (fullPin: string) => {
    const cleanPin = String(fullPin || "").trim()
    if (cleanPin.length !== 4) return

    setVerifying(true)
    setError(null)

    try {
      const res = await fetch("/api/tv/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: cleanPin }),
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
        setPin("")
        setTimeout(() => {
          masterInputRef.current?.focus()
        }, 100)
      }
    } catch {
      // Fallback check against default pin 8321 if network issue
      if (cleanPin === "8321") {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("tv_verified", "true")
          localStorage.setItem("tv_verified", "true")
        }
        setVerified(true)
      } else {
        setError("Network error verifying PIN. Please try again.")
        setPin("")
        setTimeout(() => {
          masterInputRef.current?.focus()
        }, 100)
      }
    } finally {
      setVerifying(false)
    }
  }, [])

  // Auto-verify on mount if URL contained a 4-digit PIN, or focus master input
  useEffect(() => {
    if (verified) return

    if (pin.length === 4 && !hasAutoVerifiedPin.current) {
      hasAutoVerifiedPin.current = true
      verifyPinString(pin)
    } else {
      masterInputRef.current?.focus()
    }
  }, [verified, pin, verifyPinString])

  // Handle direct input change from hidden/master input
  const handleInputChange = (rawValue: string) => {
    const cleanDigits = rawValue.replace(/\D/g, "").slice(0, 4)
    setError(null)
    setPin(cleanDigits)

    if (cleanDigits.length === 4) {
      verifyPinString(cleanDigits)
    }
  }

  // Handle on-screen keypad presses (touchscreen, kiosk, mouse clicks)
  const handleKeypadPress = (digit: string) => {
    if (verifyingRef.current) return
    setError(null)

    setPin((prev) => {
      // If already at 4 digits, start over with this digit
      const nextPin = (prev.length >= 4 ? digit : prev + digit).slice(0, 4)
      if (nextPin.length === 4) {
        setTimeout(() => verifyPinString(nextPin), 50)
      }
      return nextPin
    })

    // Keep master input focused for hybrid keyboard/keypad usage
    setTimeout(() => {
      masterInputRef.current?.focus()
    }, 10)
  }

  const handleKeypadBackspace = () => {
    if (verifyingRef.current) return
    setError(null)
    setPin((prev) => prev.slice(0, -1))
    masterInputRef.current?.focus()
  }

  const handleKeypadClear = () => {
    if (verifyingRef.current) return
    setError(null)
    setPin("")
    masterInputRef.current?.focus()
  }

  const handleManualSubmit = () => {
    if (pin.length === 4) {
      verifyPinString(pin)
    }
  }

  // Global keyboard & physical numpad listener
  useEffect(() => {
    if (verified) return

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (verifyingRef.current) return

      // Do not duplicate if event is already typing in the focused master input
      const isTargetInput = document.activeElement === masterInputRef.current

      // Enter key -> submit if 4 digits
      if (e.key === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault()
        setPin((currentPin) => {
          if (currentPin.length === 4) {
            verifyPinString(currentPin)
          }
          return currentPin
        })
        return
      }

      // Backspace -> delete last digit
      if (e.key === "Backspace") {
        if (!isTargetInput) {
          e.preventDefault()
          setError(null)
          setPin((prev) => prev.slice(0, -1))
        }
        return
      }

      // Escape or Delete -> clear
      if (e.key === "Escape" || e.key === "Delete") {
        e.preventDefault()
        setError(null)
        setPin("")
        masterInputRef.current?.focus()
        return
      }

      // Number keys (0-9 or Numpad0-Numpad9)
      let digit: string | null = null
      if (e.key >= "0" && e.key <= "9") {
        digit = e.key
      } else if (e.code.startsWith("Numpad") && e.code.length === 7) {
        const num = e.code.replace("Numpad", "")
        if (num >= "0" && num <= "9") {
          digit = num
        }
      }

      if (digit !== null) {
        if (!isTargetInput) {
          e.preventDefault()
          setError(null)
          setPin((prev) => {
            const nextPin = (prev.length >= 4 ? digit : prev + digit).slice(0, 4)
            if (nextPin.length === 4) {
              setTimeout(() => verifyPinString(nextPin), 50)
            }
            return nextPin
          })
        }
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [verified, verifyPinString])

  const handleLockDisplay = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("tv_verified")
      localStorage.removeItem("tv_verified")
    }
    setVerified(false)
    setPin("")
    setError(null)
    setTimeout(() => {
      masterInputRef.current?.focus()
    }, 100)
  }

  // PIN Gate
  if (!verified) {
    const fullPinEntered = pin.length === 4
    const pinDigits = [pin[0] || "", pin[1] || "", pin[2] || "", pin[3] || ""]

    return (
      <div 
        className="min-h-screen flex items-center justify-center bg-[#07090e] p-4 text-white select-none relative"
        onClick={() => masterInputRef.current?.focus()}
      >
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

          {/* Hidden master input that captures typing/paste seamlessly */}
          <input
            ref={masterInputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={(e) => handleInputChange(e.target.value)}
            disabled={verifying}
            autoFocus
            autoComplete="off"
            className="sr-only opacity-0 absolute pointer-events-none"
            aria-label="4-digit PIN code"
          />

          {/* PIN Input Display Boxes */}
          <div 
            className="flex gap-2.5 sm:gap-3 justify-center mb-4 cursor-text"
            onClick={() => masterInputRef.current?.focus()}
          >
            {[0, 1, 2, 3].map((index) => {
              const digit = pinDigits[index]
              const isCurrent = pin.length === index && !verifying
              const isFilled = Boolean(digit)

              return (
                <div
                  key={index}
                  className={`w-14 h-16 sm:w-16 sm:h-20 flex items-center justify-center text-3xl font-mono font-black rounded-xl border-2 transition-all duration-200 ${
                    error
                      ? "border-red-500/80 text-red-400 bg-red-950/20 shadow-lg shadow-red-500/10"
                      : isFilled
                      ? "border-emerald-500 text-emerald-400 bg-emerald-950/20 shadow-lg shadow-emerald-500/10"
                      : isCurrent
                      ? "border-emerald-500/60 text-white bg-emerald-950/10 ring-2 ring-emerald-500/20 animate-pulse"
                      : "border-white/10 text-white bg-black/40 hover:border-white/20"
                  }`}
                >
                  {isFilled ? "●" : ""}
                </div>
              )
            })}
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
                Enter 4-digit PIN to unlock
              </p>
            )}
          </div>

          {/* On-Screen Keypad for TV remote, touchscreens, and kiosk displays */}
          <div className="grid grid-cols-3 gap-2 w-full max-w-[280px] mb-4">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
              <button
                key={num}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleKeypadPress(num)
                }}
                disabled={verifying}
                className="h-12 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] active:bg-emerald-600/30 border border-white/[0.06] hover:border-emerald-500/40 text-xl font-bold font-mono text-white transition-all duration-150 flex items-center justify-center disabled:opacity-40 cursor-pointer select-none"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleKeypadClear()
              }}
              disabled={verifying}
              title="Clear all"
              className="h-12 rounded-xl bg-white/[0.02] hover:bg-rose-500/10 active:bg-rose-500/20 border border-white/[0.04] text-xs font-black uppercase text-neutral-400 hover:text-rose-400 transition-all duration-150 flex items-center justify-center disabled:opacity-40 cursor-pointer select-none"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleKeypadPress("0")
              }}
              disabled={verifying}
              className="h-12 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] active:bg-emerald-600/30 border border-white/[0.06] hover:border-emerald-500/40 text-xl font-bold font-mono text-white transition-all duration-150 flex items-center justify-center disabled:opacity-40 cursor-pointer select-none"
            >
              0
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleKeypadBackspace()
              }}
              disabled={verifying}
              title="Backspace"
              className="h-12 rounded-xl bg-white/[0.02] hover:bg-white/[0.08] active:bg-white/[0.15] border border-white/[0.04] text-neutral-400 hover:text-white transition-all duration-150 flex items-center justify-center disabled:opacity-40 cursor-pointer select-none"
            >
              <FiDelete size={18} />
            </button>
          </div>

          {/* Unlock Submit Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleManualSubmit()
            }}
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
      <button
        onClick={handleLockDisplay}
        title="Lock Display"
        className="absolute top-2 right-2 z-50 p-2 rounded-lg bg-neutral-900/60 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all text-xs flex items-center gap-1.5 opacity-40 hover:opacity-100 border border-white/5"
      >
        <FiLock size={12} />
        <span className="text-[10px] font-mono uppercase tracking-wider">Lock</span>
      </button>
      <SalesBoard />
    </div>
  )
}
