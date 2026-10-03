"use client"

// Dual-Tone Multi-Frequency (DTMF) Frequencies
const DTMF_FREQUENCIES: Record<string, [number, number]> = {
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "A": [697, 1633],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "B": [770, 1633],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  "C": [852, 1633],
  "*": [941, 1209],
  "0": [941, 1336],
  "#": [941, 1477],
  "D": [941, 1633],
}

let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null
  try {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtx) {
        audioContext = new AudioCtx()
      }
    }
    if (audioContext && audioContext.state === "suspended") {
      audioContext.resume().catch(() => {})
    }
    return audioContext
  } catch {
    return null
  }
}

/**
 * Play authentic dual-frequency DTMF tone for a keypad button
 */
export function playDtmfTone(digit: string, durationMs = 180): void {
  const freqs = DTMF_FREQUENCIES[digit.toUpperCase()]
  if (!freqs) return

  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gainNode = ctx.createGain()

    osc1.type = "sine"
    osc1.frequency.setValueAtTime(freqs[0], ctx.currentTime)

    osc2.type = "sine"
    osc2.frequency.setValueAtTime(freqs[1], ctx.currentTime)

    const now = ctx.currentTime
    const stopTime = now + durationMs / 1000

    gainNode.gain.setValueAtTime(0.001, now)
    gainNode.gain.linearRampToValueAtTime(0.15, now + 0.01)
    gainNode.gain.setValueAtTime(0.15, stopTime - 0.02)
    gainNode.gain.linearRampToValueAtTime(0.001, stopTime)

    osc1.connect(gainNode)
    osc2.connect(gainNode)
    gainNode.connect(ctx.destination)

    osc1.start(now)
    osc2.start(now)
    osc1.stop(stopTime)
    osc2.stop(stopTime)
  } catch (err) {
    console.warn("DTMF tone playback blocked or unsupported:", err)
  }
}

/**
 * Play standard ringback tone (repeating ringing tone)
 */
export function playRingbackBeep(): () => void {
  const ctx = getAudioContext()
  if (!ctx) return () => {}

  let isPlaying = true
  let osc1: OscillatorNode | null = null
  let osc2: OscillatorNode | null = null
  let gainNode: GainNode | null = null

  try {
    osc1 = ctx.createOscillator()
    osc2 = ctx.createOscillator()
    gainNode = ctx.createGain()

    osc1.type = "sine"
    osc1.frequency.setValueAtTime(440, ctx.currentTime) // US ringback standard: 440Hz + 480Hz
    osc2.type = "sine"
    osc2.frequency.setValueAtTime(480, ctx.currentTime)

    gainNode.gain.setValueAtTime(0.06, ctx.currentTime)

    osc1.connect(gainNode)
    osc2.connect(gainNode)
    gainNode.connect(ctx.destination)

    osc1.start()
    osc2.start()

    // 2 seconds on, 4 seconds off ringing cycle
    const interval = setInterval(() => {
      if (!isPlaying || !ctx || !gainNode) return
      gainNode.gain.setValueAtTime(0.06, ctx.currentTime)
      setTimeout(() => {
        if (!isPlaying || !ctx || !gainNode) return
        gainNode.gain.setValueAtTime(0.0001, ctx.currentTime)
      }, 2000)
    }, 6000)

    return () => {
      isPlaying = false
      clearInterval(interval)
      try {
        osc1?.stop()
        osc2?.stop()
        osc1?.disconnect()
        osc2?.disconnect()
        gainNode?.disconnect()
      } catch {}
    }
  } catch {
    return () => {}
  }
}

/**
 * Play telephone hangup click sound
 */
export function playHangupClick(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.setValueAtTime(320, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.12)
  } catch {}
}

/**
 * Play authentic dual-frequency incoming telephone ringtone
 */
export function playInboundRingTone(): () => void {
  const ctx = getAudioContext()
  if (!ctx) return () => {}

  let isPlaying = true
  let osc1: OscillatorNode | null = null
  let osc2: OscillatorNode | null = null
  let gainNode: GainNode | null = null

  try {
    osc1 = ctx.createOscillator()
    osc2 = ctx.createOscillator()
    gainNode = ctx.createGain()

    // 753Hz + 960Hz warbling ringer
    osc1.type = "sine"
    osc1.frequency.setValueAtTime(753, ctx.currentTime)
    osc2.type = "sine"
    osc2.frequency.setValueAtTime(960, ctx.currentTime)

    gainNode.gain.setValueAtTime(0.12, ctx.currentTime)

    osc1.connect(gainNode)
    osc2.connect(gainNode)
    gainNode.connect(ctx.destination)

    osc1.start()
    osc2.start()

    // Ring rhythm: 1.5s ring, 2.5s silence
    const ringCycle = setInterval(() => {
      if (!isPlaying || !ctx || !gainNode) return
      gainNode.gain.setValueAtTime(0.12, ctx.currentTime)
      setTimeout(() => {
        if (!isPlaying || !ctx || !gainNode) return
        gainNode.gain.setValueAtTime(0.0001, ctx.currentTime)
      }, 1500)
    }, 4000)

    return () => {
      isPlaying = false
      clearInterval(ringCycle)
      try {
        osc1?.stop()
        osc2?.stop()
        osc1?.disconnect()
        osc2?.disconnect()
        gainNode?.disconnect()
      } catch {}
    }
  } catch {
    return () => {}
  }
}

