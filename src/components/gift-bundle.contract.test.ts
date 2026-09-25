import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

describe('gift bundle configuration and POS selection contract', () => {
  it('supports exact fixed products and tag-driven variable products in Product Information', () => {
    const editor = read('src/components/ProductPopoutContent.tsx')
    expect(editor).toContain('Bundle components')
    expect(editor).toContain("value=\"VARIABLE_TAG\"")
    expect(editor).toContain('Choose exact product')
  })

  it('rejects unmapped or unknown-cost bundle options and revalidates exact POS selections', () => {
    const update = read('src/app/api/update-product/route.ts')
    const transaction = read('netlify/functions/create-transaction.ts')
    expect(update).toContain('Every bundle option must have an exact Books item and authoritative cost.')
    expect(transaction).toContain('requires an exact bundle option')
    expect(transaction).toContain('not an authoritative configured variant')
  })
})
