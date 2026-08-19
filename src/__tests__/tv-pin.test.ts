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

  // Keypad simulation helpers matching TVPage implementation
  function applyKeypadPress(currentPin: string, digit: string): string {
    const cleanDigit = String(digit).replace(/\D/g, '').slice(-1)
    if (!cleanDigit) return currentPin
    return (currentPin.length >= 4 ? cleanDigit : currentPin + cleanDigit).slice(0, 4)
  }

  function applyKeypadBackspace(currentPin: string): string {
    return currentPin.slice(0, -1)
  }

  function applyKeypadClear(): string {
    return ''
  }

  function applyPhysicalInput(rawValue: string): string {
    return rawValue.replace(/\D/g, '').slice(0, 4)
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

  it('handles keypad sequence (1 -> 2 -> 3 -> 4)', () => {
    let pin = ''
    pin = applyKeypadPress(pin, '8')
    assert.strictEqual(pin, '8')
    pin = applyKeypadPress(pin, '3')
    assert.strictEqual(pin, '83')
    pin = applyKeypadPress(pin, '2')
    assert.strictEqual(pin, '832')
    pin = applyKeypadPress(pin, '1')
    assert.strictEqual(pin, '8321')
    assert.strictEqual(verifyPin(pin), true)
  })

  it('handles keypad backspace and clear correctly', () => {
    let pin = '832'
    pin = applyKeypadBackspace(pin)
    assert.strictEqual(pin, '83')
    pin = applyKeypadClear()
    assert.strictEqual(pin, '')
  })

  it('resets cleanly when pressing a key on an already full 4-digit PIN', () => {
    let pin = '9999'
    pin = applyKeypadPress(pin, '8')
    assert.strictEqual(pin, '8')
  })

  it('cleanses raw physical keyboard input and paste', () => {
    assert.strictEqual(applyPhysicalInput('8321'), '8321')
    assert.strictEqual(applyPhysicalInput('8-3-2-1'), '8321')
    assert.strictEqual(applyPhysicalInput('abc8321xyz'), '8321')
    assert.strictEqual(applyPhysicalInput('83219999'), '8321')
  })
})
