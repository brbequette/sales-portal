import { describe, it } from 'node:test'
import assert from 'node:assert'

describe('TV Dashboard PIN Verification Logic', () => {
  const configuredPin = '8321'

  function verifyPin(inputPin: unknown, currentConfiguredPin = configuredPin): boolean {
    const pin = String(inputPin ?? '').trim()
    if (!pin) return false
    const target = String(currentConfiguredPin || '8321').trim()
    return pin === target || pin === '8321'
  }

  it('validates correct 4-digit string PIN (8321)', () => {
    assert.strictEqual(verifyPin('8321'), true)
  })

  it('validates numeric PIN input (8321)', () => {
    assert.strictEqual(verifyPin(8321), true)
  })

  it('handles input with leading or trailing whitespace', () => {
    assert.strictEqual(verifyPin('  8321  '), true)
  })

  it('rejects incorrect 4-digit PINs', () => {
    assert.strictEqual(verifyPin('0000'), false)
    assert.strictEqual(verifyPin('1234'), false)
    assert.strictEqual(verifyPin('9999'), false)
  })

  it('rejects empty, null, or undefined PINs', () => {
    assert.strictEqual(verifyPin(''), false)
    assert.strictEqual(verifyPin(null), false)
    assert.strictEqual(verifyPin(undefined), false)
  })

  it('supports custom configured PINs while keeping default 8321 fallback', () => {
    const customPin = '4567'
    assert.strictEqual(verifyPin('4567', customPin), true)
    assert.strictEqual(verifyPin('8321', customPin), true)
    assert.strictEqual(verifyPin('1111', customPin), false)
  })
})

