import { prisma } from "./prisma"
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID } from "./zoho-auth"

const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ORG_ID = ZOHO_ORGANIZATION_ID
const BOOKS_BASE = `https://www.zohoapis.${ZOHO_DC}/books/v3`

interface PageSyncResult {
  synced: number
  skipped: number
  apiCalls: number
  page: number
  hasMore: boolean
  error?: string
  durationMs: number
}

/**
 * Sync ONE PAGE of a single entity from Zoho Books.
 * nameMap: pre-built Map<accountNameLower, accountId> — built ONCE by the caller.
 * Returns hasMore=true if there are more pages to fetch.
 */
export async function bulkSyncPage(
  entity: string,
  page: number = 1,
  nameMap?: Map<string, string>
): Promise<PageSyncResult> {
  const startTime = Date.now()
  const result: PageSyncResult = { synced: 0, skipped: 0, apiCalls: 0, page, hasMore: false, durationMs: 0 }

  try {
    const token = await getZohoAccessToken()
    const headers = { Authorization: `Zoho-oauthtoken ${token}` }

    // Build name-to-accountId map only if not passed in (backwards compat)
    if (!nameMap) {
      const allAccounts = await prisma.account.findMany({ select: { id: true, name: true } })
      nameMap = new Map<string, string>()
      allAccounts.forEach(a => nameMap!.set(a.name.toLowerCase().trim(), a.id))
    }

    // Determine endpoint and array key
    let endpoint: string, arrayKey: string
    if (entity === 'invoices') { endpoint = 'invoices'; arrayKey = 'invoices' }
    else if (entity === 'salesorders') { endpoint = 'salesorders'; arrayKey = 'salesorders' }
    else if (entity === 'estimates') { endpoint = 'estimates'; arrayKey = 'estimates' }
    else if (entity === 'contacts') { endpoint = 'contacts'; arrayKey = 'contacts' }
    else if (entity === 'packages') { endpoint = 'packages'; arrayKey = 'packages' }
    else if (entity === 'purchaseorders') { endpoint = 'purchaseorders'; arrayKey = 'purchaseorders' }
    else if (entity === 'payments') { endpoint = 'customerpayments'; arrayKey = 'customerpayments' }
    else if (entity === 'vendors') { endpoint = 'contacts'; arrayKey = 'contacts' }  // vendors are contacts with contact_type=vendor
    else throw new Error(`Unknown entity: ${entity}`)

    // Fetch one page
    const sortParam = (entity === 'contacts' || entity === 'vendors') ? '' : '&sort_column=date&sort_order=D'
    const vendorFilter = entity === 'vendors' ? '&contact_type=vendor' : ''
    const url = `${BOOKS_BASE}/${endpoint}?organization_id=${ORG_ID}&page=${page}&per_page=200${sortParam}${vendorFilter}`
    const res = await fetch(url, { headers })
    result.apiCalls = 1

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'unknown')
      if (res.status === 401 || res.status === 403) {
        result.error = `Auth failed (${res.status}) — check Zoho credentials`
      } else if (res.status === 429) {
        result.error = 'Rate limited by Zoho — wait a minute and try again'
      } else {
        result.error = `Zoho API error ${res.status}: ${errorText.substring(0, 150)}`
      }
      result.durationMs = Date.now() - startTime
      return result
    }

    const rawText = await res.text()
    if (rawText.trim().startsWith('<')) {
      result.error = 'Zoho returned HTML — auth token may be invalid. Try refreshing the page and syncing again.'
      result.durationMs = Date.now() - startTime
      return result
    }

    let data: any
    try { data = JSON.parse(rawText) } catch {
      result.error = `Invalid JSON from Zoho: ${rawText.substring(0, 100)}`
      result.durationMs = Date.now() - startTime
      return result
    }

    if (data.code !== undefined && data.code !== 0) {
      result.error = `Zoho error: ${data.message || 'Unknown'}`
      result.durationMs = Date.now() - startTime
      return result
    }

    const items = data[arrayKey] || []
    if (items.length === 0) {
      result.durationMs = Date.now() - startTime
      return result
    }

    result.hasMore = data.page_context?.has_more_page || false

    const VALID_ORG_PREFIX = '1254360'

    // Fetch all existing database records for this page batch to preserve computed fields (profits, costs, commission, correct subtotals)
    const invoiceIds = items.map((i: any) => i.invoice_id).filter(Boolean)
    const existingInvoices = (entity === 'invoices' && invoiceIds.length > 0)
      ? await prisma.invoice.findMany({
          where: { zohoId: { in: invoiceIds } },
          select: { zohoId: true, amount: true, items: true }
        })
      : []
    const existingInvoicesMap = new Map(existingInvoices.map(i => [i.zohoId, i]))

    // Pre-fetch invoice lookup maps for payments — eliminates N+1 per-payment DB queries that caused 504 timeouts
    let paymentInvoiceLookup: Map<string, { id: string; items: any }> | null = null
    if (entity === 'payments') {
      // Collect all invoice numbers referenced by payments on this page
      const invNums: string[] = []
      for (const item of items) {
        if (typeof item.invoice_numbers === 'string' && item.invoice_numbers.trim()) {
          invNums.push(item.invoice_numbers.trim())
        } else if (Array.isArray(item.invoice_numbers) && item.invoice_numbers.length > 0) {
          const first = item.invoice_numbers[0]
          const num = typeof first === 'object' ? (first.invoice_number || '') : String(first).trim()
          if (num) invNums.push(num)
        }
      }
      const uniqueInvNums = Array.from(new Set(invNums))

      if (uniqueInvNums.length > 0) {
        // Single batch query replaces 200+ individual findFirst calls
        const matchedInvoices = await prisma.invoice.findMany({
          where: {
            OR: [
              { zohoId: { in: uniqueInvNums } },
              ...uniqueInvNums.map(num => ({
                items: { path: ['invoiceNumber'], equals: num }
              })),
              ...uniqueInvNums.map(num => ({
                items: { path: ['booksInvoiceId'], equals: num }
              })),
            ] as any
          },
          select: { id: true, zohoId: true, items: true }
        })

        // Build lookup maps keyed by every identifier an invoice might match on
        paymentInvoiceLookup = new Map()
        for (const inv of matchedInvoices) {
          if (inv.zohoId) paymentInvoiceLookup.set(inv.zohoId, inv)
          const invItems = (inv.items as any) || {}
          if (invItems.invoiceNumber) paymentInvoiceLookup.set(invItems.invoiceNumber, inv)
          if (invItems.booksInvoiceId) paymentInvoiceLookup.set(invItems.booksInvoiceId, inv)
        }
      }
    }

    const salesOrderIds = items.map((i: any) => i.salesorder_id).filter(Boolean)
    const existingSalesOrders = (entity === 'salesorders' && salesOrderIds.length > 0)
      ? await prisma.salesOrder.findMany({
          where: { zohoId: { in: salesOrderIds } },
          select: { zohoId: true, amount: true, items: true }
        })
      : []
    const existingSalesOrdersMap = new Map(existingSalesOrders.map(so => [so.zohoId, so]))

    const estimateIds = items.map((i: any) => i.estimate_id).filter(Boolean)
    const existingEstimates = (entity === 'estimates' && estimateIds.length > 0)
      ? await prisma.quote.findMany({
          where: { zohoId: { in: estimateIds } },
          select: { zohoId: true, amount: true, items: true }
        })
      : []
    const existingEstimatesMap = new Map(existingEstimates.map(q => [q.zohoId, q]))

    // Load associated SalesOrders to match invoice dates
    const salesOrderNumbers = entity === 'invoices' ? items.map((i: any) => i.salesorder_number).filter(Boolean) : []
    const uniqueSoNums = Array.from(new Set(salesOrderNumbers))
    const associatedSalesOrders = (entity === 'invoices' && uniqueSoNums.length > 0)
      ? await prisma.salesOrder.findMany({
          where: {
            OR: uniqueSoNums.flatMap(soNum => [
              {
                items: {
                  path: ['salesOrderNumber'],
                  equals: soNum
                }
              },
              {
                items: {
                  path: ['salesorder_number'],
                  equals: soNum
                }
              }
            ]) as any
          },
          select: { orderDate: true, items: true }
        })
      : []
    const salesOrderDateMap = new Map<string, Date>()
    associatedSalesOrders.forEach(so => {
      const soItems = (so.items as any) || {}
      const soNum = soItems.salesOrderNumber || soItems.salesorder_number
      if (soNum && so.orderDate) {
        salesOrderDateMap.set(String(soNum).trim().toLowerCase(), so.orderDate)
      }
    })

    const docNumbers: string[] = items.map((i: any) => i.invoice_number || i.salesorder_number || i.estimate_number).filter(Boolean).map(String)
    const matchedDeals = (entity === 'invoices' || entity === 'salesorders' || entity === 'estimates') && docNumbers.length > 0
      ? await prisma.deal.findMany({
          where: {
            OR: docNumbers.map((num: string) => ({
              name: { contains: num }
            }))
          },
          select: { id: true, name: true }
        })
      : []
    const dealLookupMap = new Map()
    for (const d of matchedDeals) {
      const parts = d.name.split('|')
      if (parts.length > 1) {
        const docRef = parts[parts.length - 1].trim().toLowerCase()
        dealLookupMap.set(docRef, d.id)
      }
    }

    const ops = []
    for (const item of items) {
      // For contacts, update existing accounts' zohoId to the Books contact ID
      if (entity === 'contacts') {
        const contactId = item.contact_id || ''
        if (!contactId || !contactId.startsWith(VALID_ORG_PREFIX)) { result.skipped++; continue }
        const contactName = (item.contact_name || '').toLowerCase().trim()
        const dbAccountId = nameMap.get(contactName)
        if (!dbAccountId) { result.skipped++; continue }

        // Check if this account already has this zohoId (no-op) or if another account owns it
        const existingWithZohoId = await prisma.account.findUnique({ where: { zohoId: contactId }, select: { id: true } })
        if (existingWithZohoId) {
          if (existingWithZohoId.id === dbAccountId) {
            result.skipped++ // Already correct
          } else {
            console.warn(`Contacts sync: zohoId ${contactId} already belongs to account ${existingWithZohoId.id}, skipping for ${dbAccountId} (${contactName})`)
            result.skipped++
          }
          continue
        }

        // Check if this account already has a different zohoId
        const currentAccount = await prisma.account.findUnique({ where: { id: dbAccountId }, select: { zohoId: true } })
        if (currentAccount && currentAccount.zohoId && currentAccount.zohoId !== contactId && currentAccount.zohoId.startsWith(VALID_ORG_PREFIX)) {
          result.skipped++
          continue
        }

        ops.push(prisma.account.update({
          where: { id: dbAccountId },
          data: { zohoId: contactId }
        }))
        continue
      }

      // ── Vendors ──
      if (entity === 'vendors') {
        const vendorId = item.contact_id || ''
        if (!vendorId) { result.skipped++; continue }
        ops.push(prisma.vendor.upsert({
          where: { zohoId: vendorId },
          update: {
            contactName: item.contact_name || null,
            companyName: item.company_name || item.contact_name || null,
            email: item.email || null,
            phone: item.phone || null,
            status: item.status || 'active',
          },
          create: {
            zohoId: vendorId,
            contactName: item.contact_name || null,
            companyName: item.company_name || item.contact_name || null,
            email: item.email || null,
            phone: item.phone || null,
            status: item.status || 'active',
          }
        }))
        continue
      }

      // ── Packages ──
      if (entity === 'packages') {
        const pkgId = item.package_id || ''
        if (!pkgId) { result.skipped++; continue }
        const pkgData = {
          packageNumber: item.package_number || null,
          salesOrderId: item.salesorder_id || null,
          salesOrderNumber: item.salesorder_number || null,
          date: item.date ? new Date(item.date) : null,
          status: item.status || null,
          carrier: item.delivery_method || item.shipping_carrier || null,
          trackingNumber: item.tracking_number || null,
          shippingCharge: parseFloat(item.shipping_charge || 0),
          items: item.line_items ? { lineItems: item.line_items } : undefined,
        }
        ops.push(prisma.package.upsert({
          where: { zohoId: pkgId },
          update: pkgData,
          create: { zohoId: pkgId, ...pkgData }
        }))
        continue
      }

      // ── Purchase Orders ──
      if (entity === 'purchaseorders') {
        const poId = item.purchaseorder_id || ''
        if (!poId) { result.skipped++; continue }
        const isDropshipment = !!(item.delivery_customer_id || item.salesorder_id)
        const poData = {
          vendorName: item.vendor_name || null,
          date: item.date ? new Date(item.date) : null,
          total: parseFloat(item.total || 0),
          status: item.status || null,
          salesOrderId: item.salesorder_id || null,
          salesOrderNumber: item.salesorder_number || null,
          isDropshipment,
          trackingNumber: item.tracking_number || null,
          items: item.line_items ? { lineItems: item.line_items } : undefined,
        }
        ops.push(prisma.purchaseOrder.upsert({
          where: { zohoId: poId },
          update: poData,
          create: { zohoId: poId, ...poData }
        }))
        continue
      }

      // ── Payments ──
      if (entity === 'payments') {
        const payId = item.payment_id || ''
        if (!payId) { result.skipped++; continue }

        let invNum: string | null = null
        if (typeof item.invoice_numbers === 'string') {
          invNum = item.invoice_numbers.trim()
        } else if (Array.isArray(item.invoice_numbers) && item.invoice_numbers.length > 0) {
          const first = item.invoice_numbers[0]
          invNum = typeof first === 'object' ? (first.invoice_number || null) : String(first).trim()
        }

        // Use pre-fetched lookup map instead of per-payment DB query (fixes 504 timeout)
        const targetInvoice = (invNum && paymentInvoiceLookup) ? (paymentInvoiceLookup.get(invNum) || null) : null

        const paymentData = {
          invoiceId: targetInvoice ? targetInvoice.id : (item.invoice_id || null),
          invoiceNumber: invNum || item.reference_number || null,
          amount: parseFloat(item.amount || 0),
          date: item.date ? new Date(item.date) : null,
          mode: item.payment_mode || item.payment_mode_formatted || null,
          status: item.payment_status || item.status || 'paid',
          referenceNumber: item.reference_number || null,
          bankCharges: parseFloat(item.bank_charges || 0),
        }

        ops.push(prisma.payment.upsert({
          where: { zohoId: payId },
          update: paymentData,
          create: { zohoId: payId, ...paymentData }
        }))

        if (targetInvoice) {
          ops.push(prisma.invoice.update({
            where: { id: targetInvoice.id },
            data: {
              status: 'paid',
              items: typeof targetInvoice.items === 'object' && targetInvoice.items
                ? { ...targetInvoice.items, balance: 0, isPaid: true }
                : { balance: 0, isPaid: true }
            }
          }))
        }
        continue
      }

      // ── For invoices/salesorders/estimates: need account matching ──
      const custName = (item.customer_name || '').toLowerCase().trim()
      const dbAccountId = nameMap.get(custName)
      if (!dbAccountId) { result.skipped++; continue }

      // Validate the zohoId belongs to the correct org
      const itemId = item.invoice_id || item.salesorder_id || item.estimate_id || ''
      if (itemId && !itemId.startsWith(VALID_ORG_PREFIX)) {
        result.skipped++
        continue
      }

      if (entity === 'invoices') {
        if (!item.invoice_id) { result.skipped++; continue }
        const existingInv = existingInvoicesMap.get(item.invoice_id)
        const existingItems = (existingInv?.items as any) || {}
        const isProcessed = existingItems.deadCostTotal !== undefined || existingItems.profit !== undefined

        const savedSubtotal = isProcessed
          ? parseFloat(existingItems.sub_total || existingItems.subTotal || existingInv?.amount || 0)
          : parseFloat(item.sub_total || item.total || 0)

        const invoiceItems = {
          invoiceNumber: item.invoice_number,
          booksInvoiceId: item.invoice_id,
          balance: parseFloat(item.balance || 0),
          salesperson: item.salesperson_name || null,
          customer_name: item.customer_name || null,
          reference_number: item.reference_number || null,
          shipping_charge: parseFloat(item.shipping_charge || 0),
          payment_terms: item.payment_terms,
          payment_terms_label: item.payment_terms_label,
          salesorder_number: item.salesorder_number || null,
          shipping_address: item.shipping_address || null,
          billing_address: item.billing_address || null,
          ...existingItems, // merge calculated fields (profit, deadCostTotal, ccFees, etc.)
          sub_total: savedSubtotal, // enforce subtotal is not overwritten by spread
        }

        const soNumClean = (item.salesorder_number || '').trim().toLowerCase()
        const matchedSoDate = soNumClean ? salesOrderDateMap.get(soNumClean) : null
        const finalIssueDate = matchedSoDate || new Date(item.date || item.created_time)

        const docNo = (item.invoice_number || '').trim().toLowerCase()
        const dealId = docNo ? dealLookupMap.get(docNo) : null

        ops.push(prisma.invoice.upsert({
          where: { zohoId: item.invoice_id },
          update: {
            amount: savedSubtotal,
            status: item.status || 'draft',
            issueDate: finalIssueDate,
            dueDate: item.due_date ? new Date(item.due_date) : null,
            zohoModifiedTime: item.last_modified_time ? new Date(item.last_modified_time) : null,
            items: invoiceItems,
            dealId: dealId || undefined,
          },
          create: {
            zohoId: item.invoice_id,
            accountId: dbAccountId,
            amount: savedSubtotal,
            status: item.status || 'draft',
            issueDate: finalIssueDate,
            dueDate: item.due_date ? new Date(item.due_date) : null,
            zohoModifiedTime: item.last_modified_time ? new Date(item.last_modified_time) : null,
            items: invoiceItems,
            dealId: dealId || undefined,
          }
        }))
      } else if (entity === 'salesorders') {
        if (!item.salesorder_id) { result.skipped++; continue }
        const existingSO = existingSalesOrdersMap.get(item.salesorder_id)
        const existingSOItems = (existingSO?.items as any) || {}
        const isSOProcessed = existingSOItems.deadCostTotal !== undefined || existingSOItems.profit !== undefined

        const savedSOSubtotal = isSOProcessed
          ? parseFloat(existingSOItems.sub_total || existingSOItems.subTotal || existingSO?.amount || 0)
          : parseFloat(item.sub_total || item.total || 0)

        const soItems = {
          salesOrderNumber: item.salesorder_number,
          salesperson: item.salesperson_name || null,
          customer_name: item.customer_name || null,
          reference_number: item.reference_number || null,
          shipping_charge: parseFloat(item.shipping_charge || 0),
          shipping_address: item.shipping_address || null,
          billing_address: item.billing_address || null,
          delivery_method: item.delivery_method || null,
          ...existingSOItems, // merge calculated fields
          sub_total: savedSOSubtotal, // enforce subtotal is not overwritten by spread
        }

        const docNo = (item.salesorder_number || '').trim().toLowerCase()
        const dealId = docNo ? dealLookupMap.get(docNo) : null

        ops.push(prisma.salesOrder.upsert({
          where: { zohoId: item.salesorder_id },
          update: {
            amount: savedSOSubtotal,
            status: item.order_status || item.status || 'Pending',
            orderDate: new Date(item.date || item.created_time),
            zohoModifiedTime: item.last_modified_time ? new Date(item.last_modified_time) : null,
            items: soItems,
            dealId: dealId || undefined,
          },
          create: {
            zohoId: item.salesorder_id,
            accountId: dbAccountId,
            amount: savedSOSubtotal,
            status: item.order_status || item.status || 'Pending',
            orderDate: new Date(item.date || item.created_time),
            zohoModifiedTime: item.last_modified_time ? new Date(item.last_modified_time) : null,
            items: soItems,
            dealId: dealId || undefined,
          }
        }))
      } else if (entity === 'estimates') {
        if (!item.estimate_id) { result.skipped++; continue }
        const existingEst = existingEstimatesMap.get(item.estimate_id)
        const existingEstItems = (existingEst?.items as any) || {}
        const isEstProcessed = existingEstItems.deadCostTotal !== undefined || existingEstItems.profit !== undefined

        const savedEstSubtotal = isEstProcessed
          ? parseFloat(existingEstItems.sub_total || existingEstItems.subTotal || existingEst?.amount || 0)
          : parseFloat(item.sub_total || item.total || 0)

        const estItems = {
          estimateNumber: item.estimate_number,
          salesperson: item.salesperson_name || null,
          ...existingEstItems, // merge calculated fields
          sub_total: savedEstSubtotal, // enforce subtotal is not overwritten by spread
        }

        const docNo = (item.estimate_number || '').trim().toLowerCase()
        const dealId = docNo ? dealLookupMap.get(docNo) : null

        ops.push(prisma.quote.upsert({
          where: { zohoId: item.estimate_id },
          update: {
            amount: savedEstSubtotal,
            status: item.status || 'Draft',
            zohoModifiedTime: item.last_modified_time ? new Date(item.last_modified_time) : null,
            items: estItems,
            dealId: dealId || undefined,
          },
          create: {
            zohoId: item.estimate_id,
            accountId: dbAccountId,
            amount: savedEstSubtotal,
            status: item.status || 'Draft',
            zohoModifiedTime: item.last_modified_time ? new Date(item.last_modified_time) : null,
            items: estItems,
            dealId: dealId || undefined,
          }
        }))
      }
    }

    // Execute in batches of 50 — fall back to individual on failure
    for (let i = 0; i < ops.length; i += 50) {
      const batch = ops.slice(i, i + 50)
      try {
        await prisma.$transaction(batch)
        result.synced += batch.length
      } catch (batchErr: any) {
        console.warn(`Batch ${i / 50 + 1} failed as transaction, retrying individually: ${batchErr.message}`)
        // Execute each op individually so one bad record doesn't block the rest
        for (const op of batch) {
          try {
            await op
            result.synced++
          } catch (individualErr: any) {
            console.warn(`Individual sync failed: ${individualErr.message}`)
            result.skipped++
          }
        }
      }
    }

  } catch (err: any) {
    result.error = err.message
    console.error(`Bulk sync ${entity} page ${page} error:`, err)
  }

  result.durationMs = Date.now() - startTime
  console.log(`Bulk sync ${entity} page ${page}: ${result.synced} synced, ${result.skipped} skipped, ${result.apiCalls} API call, ${result.durationMs}ms`)
  return result
}
