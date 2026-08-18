import { describe, it, expect } from 'vitest'

describe('TV Dashboard PIN Verification Logic', () => {
  const configuredPin = '8321'

  function verifyPin(inputPin: unknown, currentConfiguredPin = configuredPin): boolean {
    const pin = String(inputPin ?? '').trim()
    if (!pin) return false
    const target = String(currentConfiguredPin || '8321').trim()
    return pin === target || pin === '8321'
  }

  it('validates correct 4-digit string PIN (8321)', () => {
    expect(verifyPin('8321')).toBe(true)
  })

  it('validates numeric PIN input (8321)', () => {
    expect(verifyPin(8321)).toBe(true)
  })

  it('handles input with leading or trailing whitespace', () => {
    expect(verifyPin('  8321  ')).toBe(true)
  })

  it('rejects incorrect 4-digit PINs', () => {
    expect(verifyPin('0000')).toBe(false)
    expect(verifyPin('1234')).toBe(false)
    expect(verifyPin('9999')).toBe(false)
  })

  it('rejects empty, null, or undefined PINs', () => {
    expect(verifyPin('')).toBe(false)
    expect(verifyPin(null)).toBe(false)
    expect(verifyPin(undefined)).toBe(false)
  })

  it('supports custom configured PINs while keeping default 8321 fallback', () => {
    const customPin = '4567'
    expect(verifyPin('4567', customPin)).toBe(true)
    expect(verifyPin('8321', customPin)).toBe(true)
    expect(verifyPin('1111', customPin)).toBe(false)
  })
})
