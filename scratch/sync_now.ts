import { bulkSyncPage } from "../netlify/functions/lib/bulk-sync"

async function runSync(entity: string) {
  console.log(`Starting sync for ${entity}...`)
  let page = 1
  let totalSynced = 0
  while (true) {
    console.log(`Syncing ${entity} page ${page}...`)
    const res = await bulkSyncPage(entity, page)
    if (res.error) {
      console.error(`Error syncing page ${page}: ${res.error}`)
      break
    }
    totalSynced += res.synced
    console.log(`Page ${page} complete. Synced: ${res.synced}, Skipped: ${res.skipped}`)
    if (!res.hasMore) break
    page++
  }
  console.log(`Completed sync for ${entity}. Total synced: ${totalSynced}\n`)
}

async function main() {
  await runSync("salesorders")
  await runSync("estimates")
}

main().catch(console.error)
