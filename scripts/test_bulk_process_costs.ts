import { processInvoiceCostsForSystem } from "../netlify/functions/process-invoice-costs"
import { processSalesOrderCostsForSystem } from "../netlify/functions/process-salesorder-costs"
import { processQuoteCostsForSystem } from "../netlify/functions/process-quote-costs"
import { executeSyncCostsToZoho } from "../src/app/api/sync-costs-to-zoho/route"
import { POST as bulkProcessPOST } from "../src/app/api/admin/books/bulk-process-costs/route"

async function runTests() {
  console.log("▶ 1. Verifying system cost function signatures...")
  if (typeof processQuoteCostsForSystem !== "function") {
    throw new Error("processQuoteCostsForSystem is not a function")
  }
  if (typeof processInvoiceCostsForSystem !== "function") {
    throw new Error("processInvoiceCostsForSystem is not a function")
  }
  if (typeof processSalesOrderCostsForSystem !== "function") {
    throw new Error("processSalesOrderCostsForSystem is not a function")
  }
  if (typeof executeSyncCostsToZoho !== "function") {
    throw new Error("executeSyncCostsToZoho is not a function")
  }
  if (typeof bulkProcessPOST !== "function") {
    throw new Error("bulkProcessPOST is not a function")
  }
  console.log("  ✓ All function signatures and exports are valid.")

  console.log("▶ 2. Verifying trusted system calls reject missing IDs gracefully...")
  const emptyInvRes = (await processInvoiceCostsForSystem("")) as any
  const emptyInvData = JSON.parse(emptyInvRes?.body || "{}")
  if (emptyInvRes?.statusCode !== 400 || emptyInvData.success !== false) {
    throw new Error(`Expected 400 with success: false for empty invoice ID, got ${emptyInvRes?.statusCode}`)
  }
  console.log("  ✓ processInvoiceCostsForSystem correctly validated empty ID.")

  const emptySoRes = (await processSalesOrderCostsForSystem("")) as any
  const emptySoData = JSON.parse(emptySoRes?.body || "{}")
  if (emptySoRes?.statusCode !== 400 || emptySoData.success !== false) {
    throw new Error(`Expected 400 with success: false for empty SO ID, got ${emptySoRes?.statusCode}`)
  }
  console.log("  ✓ processSalesOrderCostsForSystem correctly validated empty ID.")

  const emptyQuoteRes = (await processQuoteCostsForSystem("")) as any
  const emptyQuoteData = JSON.parse(emptyQuoteRes?.body || "{}")
  if (emptyQuoteRes?.statusCode !== 400 || emptyQuoteData.success !== false) {
    throw new Error(`Expected 400 with success: false for empty Quote ID, got ${emptyQuoteRes?.statusCode}`)
  }
  console.log("  ✓ processQuoteCostsForSystem correctly validated empty ID.")

  console.log("🎉 All bulk process documents unit and integration checks passed successfully!")
}

runTests().catch(err => {
  console.error("Test failed:", err)
  process.exit(1)
})
