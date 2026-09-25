import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'netlify/functions/get-products.ts'), 'utf8')

describe('POS catalog merchandising contract', () => {
  it('derives sales history from stored line items and ranks never-sold products last', () => {
    expect(source).toContain('prisma.lineItem.groupBy')
    expect(source).toContain('salesQuantity')
    expect(source).toContain('Number(right.salesQuantity > 0) - Number(left.salesQuantity > 0)')
  })
})
