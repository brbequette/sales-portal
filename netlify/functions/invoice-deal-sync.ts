import type { Config } from '@netlify/functions'
import { runDealSyncBatch } from '../../src/lib/deal-sync-worker'
export default async () => {
  const result = await runDealSyncBatch()
  console.log(JSON.stringify({ enabled: result.enabled, processed: result.results.length, errors: result.results.filter(r => r.status !== 'SYNCED').length }))
}
export const config: Config = { schedule: '*/5 * * * *' }
