import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Zoho Books webhook load policy', () => {
  it('keeps the authenticated webhook as the Books update path', () => {
    const webhook = read('netlify/functions/zoho-books-webhook.ts')
    expect(webhook).toContain('processInvoiceCosts')
    expect(webhook).toContain('processSalesOrderCosts')
    expect(webhook).toContain('ZOHO_WEBHOOK_TOKEN')
  })

  it('does not poll financial header or pipeline data from every browser tab', () => {
    const topBar = read('src/components/useGlobalTopBarData.ts')
    const pipeline = read('src/components/DealPipeline.tsx')
    expect(topBar).not.toContain('setInterval(fetchStripStats')
    expect(pipeline).not.toContain('setInterval(fetchPipelineData')
  })
})
