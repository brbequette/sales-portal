/**
 * Runner script to call the backfill-invoice-links endpoint repeatedly until all invoices are processed.
 * Usage: node scripts/run-backfill.js [base_url]
 * Default base URL: http://localhost:3000
 */

const BASE_URL = process.argv[2] || 'http://localhost:3000'
const NOTIFY_EMAIL = 'ben@titandiamond.net'
const BATCH_SIZE = 50
const DELAY_BETWEEN_BATCHES_MS = 2000

async function runBackfill() {
  console.log(`\n🔗 Invoice Link Backfill`)
  console.log(`   Target: ${BASE_URL}`)
  console.log(`   Batch Size: ${BATCH_SIZE}`)
  console.log(`   Notify: ${NOTIFY_EMAIL}`)
  console.log(`   Started: ${new Date().toLocaleString()}\n`)

  // Check initial progress
  try {
    const check = await fetch(`${BASE_URL}/api/admin/backfill-invoice-links`)
    const status = await check.json()
    console.log(`📊 Current Status:`)
    console.log(`   Total: ${status.total}, Processed: ${status.processed}, Remaining: ${status.remaining}`)
    console.log(`   Linked to SO: ${status.linkedToSO}, Linked to Estimate: ${status.linkedToEstimate}`)
    console.log(`   Progress: ${status.percentComplete}%\n`)
  } catch (e) {
    console.log(`⚠️  Could not check initial status: ${e.message}\n`)
  }

  let batchNum = 0
  let totalProcessed = 0
  let totalLinked = 0

  while (true) {
    batchNum++
    const isLast = false // we don't know yet
    const url = `${BASE_URL}/api/admin/backfill-invoice-links?limit=${BATCH_SIZE}&notifyEmail=${encodeURIComponent(NOTIFY_EMAIL)}`
    
    try {
      const res = await fetch(url, { method: 'POST' })
      const data = await res.json()

      if (!data.success) {
        console.error(`❌ Batch ${batchNum} failed:`, data.error)
        break
      }

      totalProcessed += data.batchProcessed
      totalLinked += data.batchLinked

      console.log(`✅ Batch ${batchNum}: ${data.batchProcessed} processed, ${data.batchLinked} linked, ${data.batchErrors} errors | ${data.remaining} remaining`)

      if (data.isComplete) {
        console.log(`\n🎉 BACKFILL COMPLETE!`)
        console.log(`   Total Processed: ${totalProcessed}`)
        console.log(`   Total Linked: ${totalLinked}`)
        console.log(`   Email sent to: ${NOTIFY_EMAIL}`)
        console.log(`   Completed: ${new Date().toLocaleString()}`)
        break
      }

      // Wait between batches
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS))
    } catch (e) {
      console.error(`❌ Batch ${batchNum} network error:`, e.message)
      console.log(`   Retrying in 10 seconds...`)
      await new Promise(r => setTimeout(r, 10000))
    }
  }
}

runBackfill()
