/**
 * backfill_po_invoice_links.js  (v2)
 *
 * Business Rule (per owner):
 *   If a PO destination is a CUSTOMER (not Titan Diamond's own warehouse),
 *   it IS a dropship — regardless of what Zoho's is_drop_shipment flag says.
 *   Signal = delivery_customer_id is populated on the PO detail.
 *
 * Strategy (fast — no brute-force detail fetch):
 *
 *  Pass 1 — List-level: reference_number matches a local SO number
 *    PO.reference_number → SO.items.salesOrderNumber → EST-xxxx → Invoice
 *
 *  Pass 2 — Detail fetch ONLY for POs with is_drop_shipment=true (Zoho flag)
 *    Pull detail, check delivery_customer_id / salesorders[]
 *    Match to local Invoice via Account.zohoContactId OR SO chain
 *
 *  Pass 3 — Fuzzy: delivery_customer_name + date proximity (±45 days)
 *    For dropship POs not resolved in Pass 2, match customer name → invoice
 *
 *  DB update: salesOrderId, salesOrderNumber, invoiceNumber, invoiceId,
 *             isDropshipment=true, shipToName, referenceNumber
 *
 * Run: node backfill_po_invoice_links.js
 */

const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

const CLIENT_ID     = process.env.ZOHO_CLIENT_ID     || "1000.XW3WINW3H421OTV0PEUGKQ4X7UYVFK"
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET || "0267c0d4b05b6c3061290007135cd499c6ff14cd5d"
const REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN || "1000.f601eba1f1712f228ccb1c6690178be9.dcc85a75fd9af618d09b8830fb955435"
const ORG_ID        = process.env.ZOHO_ORGANIZATION_ID || "664670946"
const ZOHO_DC       = process.env.ZOHO_DC || "com"
const BASE_URL      = `https://www.zohoapis.${ZOHO_DC}/books/v3`

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ── Auth ──────────────────────────────────────────────────────────────────────

let _token = null
let _tokenAt = 0
async function getToken() {
  if (_token && Date.now() - _tokenAt < 55 * 60 * 1000) return _token
  const res = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `refresh_token=${REFRESH_TOKEN}&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=refresh_token`,
  })
  const data = await res.json()
  if (!data.access_token) throw new Error("Token error: " + JSON.stringify(data))
  _token = data.access_token
  _tokenAt = Date.now()
  return _token
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchAllPOList() {
  const all = []
  let page = 1
  let hasMore = true
  while (hasMore && page <= 40) {
    const token = await getToken()
    const url = `${BASE_URL}/purchaseorders?organization_id=${ORG_ID}&per_page=200&page=${page}&filter_by=Status.All`
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: AbortSignal.timeout(20000) })
    const data = await res.json()
    if (data.code !== 0) throw new Error(`PO list p${page}: ${data.message}`)
    all.push(...(data.purchaseorders || []))
    hasMore = data.page_context?.has_more_page === true
    page++
    process.stdout.write(`\r  ${all.length} POs fetched (page ${page-1})...`)
  }
  console.log(`\n  Total: ${all.length}`)
  return all
}

async function fetchPODetail(poId) {
  const token = await getToken()
  const res = await fetch(`${BASE_URL}/purchaseorders/${poId}?organization_id=${ORG_ID}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    signal: AbortSignal.timeout(12000),
  })
  const data = await res.json()
  if (data.code !== 0) return null
  return data.purchaseorder
}

// ── Normalize name for fuzzy match ────────────────────────────────────────────
function normName(s) {
  return (s || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim()
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== PO → Invoice Backfill v2 ===")
  console.log("Rule: delivery_customer_id populated = dropship\n")

  // ── Build local indexes ────────────────────────────────────────────────────
  console.log("Building local indexes...")
  const [allSOs, allInvoices, allAccounts, allLocalPOs] = await Promise.all([
    prisma.salesOrder.findMany(),
    prisma.invoice.findMany(),
    prisma.account.findMany(),
    prisma.purchaseOrder.findMany(),
  ])

  // SO indexes
  const soBySONum  = new Map(allSOs.filter(s => s.items?.salesOrderNumber)
    .map(s => [String(s.items.salesOrderNumber), s]))
  const soByZohoId = new Map(allSOs.filter(s => s.zohoId).map(s => [s.zohoId, s]))

  // Invoice by estimateNumber chain (SO → EST → Invoices)
  const invsByEstNum = new Map()
  for (const inv of allInvoices) {
    const est = inv.items?.estimateNumber
    if (est) {
      if (!invsByEstNum.has(est)) invsByEstNum.set(est, [])
      invsByEstNum.get(est).push(inv)
    }
  }

  // Account by zohoContactId (Zoho customer_id → local account)
  const accountByZohoContactId = new Map()
  for (const acc of allAccounts) {
    // accounts may have a zohoId or zohoContactId field
    const zid = acc.zohoId || acc.zohoContactId
    if (zid) accountByZohoContactId.set(String(zid), acc)
  }

  // Invoice by accountId + date for fuzzy match
  // Group invoices by normalized customer name
  const invsByCustomerName = new Map()
  for (const inv of allInvoices) {
    const name = normName(inv.items?.customer_name || "")
    if (name) {
      if (!invsByCustomerName.has(name)) invsByCustomerName.set(name, [])
      invsByCustomerName.get(name).push(inv)
    }
  }

  // Invoices by accountId
  const invsByAccountId = new Map()
  for (const inv of allInvoices) {
    if (!invsByAccountId.has(inv.accountId)) invsByAccountId.set(inv.accountId, [])
    invsByAccountId.get(inv.accountId).push(inv)
  }

  // Local PO by zohoId
  const localPOByZohoId = new Map(allLocalPOs.map(p => [p.zohoId, p]))

  console.log(`  SOs: ${allSOs.length} | Invoices: ${allInvoices.length} | Accounts: ${allAccounts.length}`)
  console.log(`  Account→ZohoId map size: ${accountByZohoContactId.size}`)
  console.log(`  Local POs: ${allLocalPOs.length}`)

  // Helper: best invoice for a SO
  function bestInvForSO(so) {
    const estRef = so?.items?.reference_number
    if (!estRef) return null
    const invs = invsByEstNum.get(estRef) || []
    if (!invs.length) return null
    return invs.find(i => i.status === "paid") ||
           invs.sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate))[0]
  }

  // Helper: best invoice for a customer name + date
  function bestInvForCustomerDate(customerName, poDate, windowDays = 45) {
    const norm = normName(customerName)
    const invs = invsByCustomerName.get(norm) || []
    if (!invs.length) return null
    const poTime = new Date(poDate).getTime()
    const window = windowDays * 86400000
    // Filter invoices within ±windowDays of the PO date
    const nearby = invs.filter(inv => {
      const invTime = new Date(inv.issueDate).getTime()
      return Math.abs(invTime - poTime) <= window
    })
    if (!nearby.length) return null
    // Prefer paid, then closest to PO date
    return nearby.find(i => i.status === "paid") ||
           nearby.sort((a, b) => {
             const da = Math.abs(new Date(a.issueDate).getTime() - poTime)
             const db = Math.abs(new Date(b.issueDate).getTime() - poTime)
             return da - db
           })[0]
  }

  // ── Fetch all POs (list level) ─────────────────────────────────────────────
  console.log("\nFetching full PO list from Zoho...")
  const allZohoPOs = await fetchAllPOList()

  // Classify at list level
  const withRef     = allZohoPOs.filter(p => p.reference_number)
  const flaggedDrop = allZohoPOs.filter(p => p.is_drop_shipment && !p.reference_number)
  const noLink      = allZohoPOs.filter(p => !p.is_drop_shipment && !p.reference_number)

  console.log(`\nList-level breakdown:`)
  console.log(`  With reference_number:     ${withRef.length}`)
  console.log(`  is_drop_shipment (no ref): ${flaggedDrop.length}`)
  console.log(`  No link signals at all:    ${noLink.length}`)

  const updates = new Map()  // zohoId → update object

  // ── PASS 1: reference_number → SO chain ───────────────────────────────────
  console.log("\n── Pass 1: reference_number → SO → Invoice ──")
  let p1resolved = 0
  for (const zpo of withRef) {
    const ref = String(zpo.reference_number || "").trim()
    // Try as SO number
    let so = soBySONum.get(ref)
    if (!so) {
      // Try with leading zeros stripped or as-is
      const refNum = ref.replace(/^0+/, "")
      so = soBySONum.get(refNum)
    }
    if (so) {
      const inv = bestInvForSO(so)
      updates.set(zpo.purchaseorder_id, {
        zohoId:           zpo.purchaseorder_id,
        salesOrderId:     so.zohoId,
        salesOrderNumber: String(so.items?.salesOrderNumber || ref),
        invoiceNumber:    inv ? String(inv.items?.invoiceNumber || "") : null,
        invoiceId:        inv ? inv.zohoId : null,
        isDropshipment:   true,
        shipToName:       null,   // will be enriched in Pass 2 if needed
        referenceNumber:  ref,
      })
      p1resolved++
    }
  }
  console.log(`  Resolved: ${p1resolved} / ${withRef.length}`)

  // ── PASS 2: Detail fetch for flagged dropships only ───────────────────────
  console.log(`\n── Pass 2: Detail fetch for ${flaggedDrop.length} flagged dropship POs ──`)
  let p2fetched = 0, p2resolved = 0, p2errors = 0

  for (const zpo of flaggedDrop) {
    if (updates.has(zpo.purchaseorder_id)) continue
    try {
      const detail = await fetchPODetail(zpo.purchaseorder_id)
      p2fetched++

      if (!detail) { p2errors++; continue }

      const delivCustId   = detail.delivery_customer_id || ""
      const delivCustName = detail.delivery_customer_name || ""
      const soLinks       = detail.salesorders || []
      const ref           = detail.reference_number || ""
      const isDropship    = !!(delivCustId || delivCustName)

      let linkedSO = null, linkedInv = null

      // Try salesorders array first
      if (soLinks.length > 0) {
        const soNum = String(soLinks[0].salesorder_number || "")
        const soId  = String(soLinks[0].salesorder_id || "")
        linkedSO  = soBySONum.get(soNum) || soByZohoId.get(soId)
        linkedInv = bestInvForSO(linkedSO)
      }

      // Try reference_number as SO number
      if (!linkedSO && ref) {
        linkedSO  = soBySONum.get(ref)
        linkedInv = bestInvForSO(linkedSO)
      }

      // Try delivery_customer_id → account → invoices
      if (!linkedInv && delivCustId) {
        const acc  = accountByZohoContactId.get(String(delivCustId))
        if (acc) {
          const accInvs = invsByAccountId.get(acc.id) || []
          if (accInvs.length > 0) {
            const poTime = detail.date ? new Date(detail.date).getTime() : 0
            const nearby = accInvs.filter(i => Math.abs(new Date(i.issueDate).getTime() - poTime) <= 45*86400000)
            linkedInv = nearby.find(i => i.status === "paid") || nearby[0] || accInvs[0]
          }
        }
      }

      // Try fuzzy name + date match
      if (!linkedInv && delivCustName && detail.date) {
        linkedInv = bestInvForCustomerDate(delivCustName, detail.date)
      }

      if (isDropship || linkedInv) {
        updates.set(detail.purchaseorder_id, {
          zohoId:           detail.purchaseorder_id,
          salesOrderId:     linkedSO?.zohoId || null,
          salesOrderNumber: linkedSO ? String(linkedSO.items?.salesOrderNumber || "") : (ref || null),
          invoiceNumber:    linkedInv ? String(linkedInv.items?.invoiceNumber || "") : null,
          invoiceId:        linkedInv ? linkedInv.zohoId : null,
          isDropshipment:   true,
          shipToName:       delivCustName || null,
          referenceNumber:  ref || null,
        })
        if (linkedInv) p2resolved++
      }

      if (p2fetched % 50 === 0) {
        process.stdout.write(`\r  Fetched: ${p2fetched}/${flaggedDrop.length}, resolved: ${p2resolved}...`)
      }
      await sleep(80)  // ~12 req/sec

    } catch (e) {
      p2errors++
      if (p2errors < 5) console.error(`\n  Error ${zpo.purchaseorder_id}:`, e.message)
    }
  }
  console.log(`\n  Fetched: ${p2fetched}, resolved to invoice: ${p2resolved}, errors: ${p2errors}`)

  // ── PASS 3: Fuzzy match for any remaining dropship POs in local DB ─────────
  // These are POs already in DB with shipToName but no invoiceNumber yet
  console.log("\n── Pass 3: Fuzzy match existing DB dropships with no invoice link ──")
  let p3resolved = 0
  const dbDropsUnlinked = allLocalPOs.filter(p =>
    p.shipToName && !p.invoiceNumber && !updates.has(p.zohoId)
  )
  console.log(`  Candidates: ${dbDropsUnlinked.length}`)
  for (const po of dbDropsUnlinked) {
    if (!po.date) continue
    const inv = bestInvForCustomerDate(po.shipToName, po.date)
    if (inv) {
      updates.set(po.zohoId, {
        zohoId:        po.zohoId,
        salesOrderId:  po.salesOrderId,
        salesOrderNumber: po.salesOrderNumber,
        invoiceNumber: String(inv.items?.invoiceNumber || ""),
        invoiceId:     inv.zohoId,
        isDropshipment: true,
        shipToName:    po.shipToName,
        referenceNumber: po.referenceNumber,
      })
      p3resolved++
    }
  }
  console.log(`  Resolved: ${p3resolved}`)

  // ── Write to DB ────────────────────────────────────────────────────────────
  console.log(`\n── Writing ${updates.size} updates to DB ──`)
  let dbUpdated = 0, dbSkipped = 0, dbErrors = 0

  for (const [zohoId, upd] of updates) {
    const local = localPOByZohoId.get(zohoId)
    if (!local) { dbSkipped++; continue }

    try {
      await prisma.purchaseOrder.update({
        where: { zohoId },
        data: {
          salesOrderId:     upd.salesOrderId     ?? local.salesOrderId,
          salesOrderNumber: upd.salesOrderNumber ?? local.salesOrderNumber,
          invoiceNumber:    upd.invoiceNumber     ?? local.invoiceNumber,
          invoiceId:        upd.invoiceId         ?? local.invoiceId,
          isDropshipment:   upd.isDropshipment    ?? local.isDropshipment,
          shipToName:       upd.shipToName        ?? local.shipToName,
          referenceNumber:  upd.referenceNumber   ?? local.referenceNumber,
        }
      })
      dbUpdated++
    } catch (e) {
      dbErrors++
      if (dbErrors < 5) console.error("  DB error:", e.message)
    }
  }
  dbSkipped += updates.size - dbUpdated - dbErrors

  // ── Results ────────────────────────────────────────────────────────────────
  const [withSO, withInv, isDrop, withShip] = await Promise.all([
    prisma.purchaseOrder.count({ where: { salesOrderNumber: { not: null } } }),
    prisma.purchaseOrder.count({ where: { invoiceNumber: { not: null } } }),
    prisma.purchaseOrder.count({ where: { isDropshipment: true } }),
    prisma.purchaseOrder.count({ where: { shipToName: { not: null } } }),
  ])

  console.log(`\n=== Final Results ===`)
  console.log(`  Pass 1 resolved (reference_number):  ${p1resolved}`)
  console.log(`  Pass 2 resolved (detail+fuzzy):       ${p2resolved}`)
  console.log(`  Pass 3 resolved (existing DB fuzzy):  ${p3resolved}`)
  console.log(`  Total updates queued:                 ${updates.size}`)
  console.log(`  DB records updated:                   ${dbUpdated}`)
  console.log(`  Skipped (not in local DB):            ${dbSkipped}`)
  console.log(`  DB errors:                            ${dbErrors}`)
  console.log(`\n=== DB PO Linkage After Backfill ===`)
  console.log(`  POs with salesOrderNumber:  ${withSO}`)
  console.log(`  POs with invoiceNumber:     ${withInv}`)
  console.log(`  Dropship POs (flagged):     ${isDrop}`)
  console.log(`  POs with shipToName:        ${withShip}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
