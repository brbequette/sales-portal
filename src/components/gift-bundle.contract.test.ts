import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

describe('gift bundle configuration and POS selection contract', () => {
  it('supports exact fixed products and tag-driven variable products in Product Information', () => {
    const editor = read('src/components/ProductPopoutContent.tsx')
    const catalog = read('netlify/functions/get-products.ts')
    expect(editor).toContain('Bundle components')
    expect(editor).toContain("value=\"VARIABLE_TAG\"")
    expect(editor).toContain('Choose exact product')
    expect(editor).toContain('/api/get-products?id=')
    expect(editor).toContain('/api/get-products?giftOnly=true')
    expect(catalog).toContain('where: id ? { id } : giftOnly ? { giftItem: true } : searchWhere')
  })

  it('rejects unmapped or unknown-cost bundle options and revalidates exact POS selections', () => {
    const update = read('src/app/api/update-product/route.ts')
    const transaction = read('netlify/functions/create-transaction.ts')
    const orderBuilderData = read('src/components/useOrderBuilderData.ts')
    expect(update).toContain('Every bundle option must have an exact Books item and authoritative cost.')
    expect(transaction).toContain('requires an exact bundle option')
    expect(transaction).toContain('not an authoritative configured variant')
    expect(transaction).toContain('A configured gift bundle component is no longer authoritative.')
    expect(transaction).toContain('Bundle component of ${line.name || line.sku} (PROMO FREE)')
    expect(transaction).toContain('financialZohoLineItems(expandedLineItems)')
    expect(orderBuilderData).toContain('/api/get-products?giftOnly=true')
    expect(orderBuilderData).toContain('const merged = new Map<string, any>()')
  })
})
