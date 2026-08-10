import { describe, it, expect } from 'vitest'

describe('Sales Portal', () => {
  it('should have a working test setup', () => {
    expect(1 + 1).toBe(2)
  })

  it('should format currency correctly', () => {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(1234.56)
    expect(formatted).toBe('$1,234.56')
  })
})
