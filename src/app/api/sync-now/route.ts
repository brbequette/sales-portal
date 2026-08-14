import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID } from '@/lib/zoho-auth'
import {
  getSyncConfig,
  getSyncStatus,
  isTableStale,
  updateTableSyncStatus,
  SyncTable,
  SYNC_TABLES,
} from '@/lib/sync-config'

const ZOHO_DC = process.env.ZOHO_DC || 'com'

/**
 * POST /api/sync-now
 *
 * Unified delta-sync runner. Replaces all scattered Zoho calls on page load.
 *
 * Body:
 *   { tables?: SyncTable[], force?: boolean }
 *
 * - tables: which tables to sync (defaults to all)
 * - force: bypass staleness guard and sync even if not stale
 *
 * For each table, it:
 *   1. Checks if enabled (skip if not, unless force)
 *   2. Checks staleness guard (skip if fresh, unless force)
 *   3. Fetches ONLY records modified since lastSyncAt (delta fetch)
 *   4. Upserts changes to DB
 *   5. Updates sync_status with new lastSyncAt + count
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const requestedTables: SyncTable[] = body.tables || SYNC_TABLES
    const force: boolean = body.force === true

    const [config, status] = await Promise.all([getSyncConfig(), getSyncStatus()])
    const token = await getZohoAccessToken()

    const results: Record<string, { synced: number; skipped?: string; error?: string }> = {}

    // ── Leads ──────────────────────────────────────────────────────────
    if (requestedTables.includes('leads')) {
      const tConfig = config.leads
      const tStatus = status.leads

      if (!force && !tConfig.enabled) {
        results.leads = { synced: 0, skipped: 'disabled' }
      } else if (!force && !isTableStale(tStatus, tConfig)) {
        results.leads = { synced: 0, skipped: 'fresh' }
      } else {
        try {
          // Delta: only pull leads modified since last sync
          const sinceParam = tStatus.lastSyncAt
            ? `&last_modified_time=${encodeURIComponent(tStatus.lastSyncAt)}`
            : ''
          const zRes = await fetch(
            `https://www.zohoapis.${ZOHO_DC}/crm/v3/Leads?per_page=200&sort_by=Modified_Time&sort_order=desc${sinceParam}`,
            { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zLeads = zData.data || []

            for (const zLead of zLeads) {
              if (!zLead.id) continue
              const ownerZohoId = zLead.Owner?.id
              let localUser: any = null
              if (ownerZohoId) {
                localUser = await prisma.user.findFirst({
                  where: { OR: [{ zohoId: ownerZohoId }, { email: zLead.Owner?.email || '' }] },
                })
              }
              if (!localUser && session.user.id) {
                localUser = await prisma.user.findUnique({ where: { id: session.user.id } })
              }
              if (!localUser) continue

              const leadData = {
                company: zLead.Company || zLead.Last_Name || 'Unnamed Lead',
                firstName: zLead.First_Name || null,
                lastName: zLead.Last_Name || null,
                email: zLead.Email || null,
                phone: zLead.Phone || null,
                mobile: zLead.Mobile || null,
                title: zLead.Designation || null,
                industry: zLead.Industry || null,
                status: zLead.Lead_Status || 'New Lead',
                street: zLead.Street || null,
                city: zLead.City || null,
                state: zLead.State || null,
                zip: zLead.Zip_Code || null,
                rawData: zLead,
                zohoModifiedTime: zLead.Modified_Time ? new Date(zLead.Modified_Time) : null,
              }

              await prisma.lead.upsert({
                where: { zohoId: zLead.id },
                update: leadData,
                create: { zohoId: zLead.id, ownerId: localUser.id, ...leadData },
              })
              syncedCount++
            }
          }

          await updateTableSyncStatus('leads', {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.leads = { synced: syncedCount }
        } catch (err: any) {
          await updateTableSyncStatus('leads', { lastError: err.message })
          results.leads = { synced: 0, error: err.message }
        }
      }
    }

    // ── Invoices ───────────────────────────────────────────────────────
    if (requestedTables.includes('invoices')) {
      const tConfig = config.invoices
      const tStatus = status.invoices

      if (!force && !tConfig.enabled) {
        results.invoices = { synced: 0, skipped: 'disabled' }
      } else if (!force && !isTableStale(tStatus, tConfig)) {
        results.invoices = { synced: 0, skipped: 'fresh' }
      } else {
        try {
          // Delta: only pull invoices modified since last sync
          const sinceParam = tStatus.lastSyncAt
            ? `&last_modified_time=${encodeURIComponent(tStatus.lastSyncAt)}`
            : ''
          const zRes = await fetch(
            `https://www.zohoapis.${ZOHO_DC}/books/v3/invoices?organization_id=${ZOHO_ORGANIZATION_ID}&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`,
            { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zInvoices = zData.invoices || []

            for (const inv of zInvoices) {
              if (!inv.invoice_id) continue

              // Resolve local account: try customer_id first, then fall back to customer_name
              let localAccount = inv.customer_id
                ? await prisma.account.findFirst({ where: { zohoId: inv.customer_id } })
                : null
              if (!localAccount && inv.customer_name) {
                localAccount = await prisma.account.findFirst({ where: { name: inv.customer_name } })
              }

              // Check if record already exists (for update without requiring account)
              const existingInv = await prisma.invoice.findUnique({ where: { zohoId: inv.invoice_id } })
              const accountId = localAccount?.id || existingInv?.accountId
              if (!accountId) continue  // skip only if no account can be resolved at all

              await prisma.invoice.upsert({
                where: { zohoId: inv.invoice_id },
                update: {
                  status: inv.status,
                  balance: parseFloat(inv.balance || 0),
                  amount: parseFloat(inv.total || 0),
                  issueDate: inv.date ? new Date(inv.date) : undefined,
                  accountId: accountId,
                  items: inv as any,
                },
                create: {
                  zohoId: inv.invoice_id,
                  accountId: accountId,
                  status: inv.status,
                  balance: parseFloat(inv.balance || 0),
                  amount: parseFloat(inv.total || 0),
                  issueDate: inv.date ? new Date(inv.date) : new Date(),
                  items: inv as any,
                },
              })
              syncedCount++
            }
          }

          await updateTableSyncStatus('invoices', {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.invoices = { synced: syncedCount }
        } catch (err: any) {
          await updateTableSyncStatus('invoices', { lastError: err.message })
          results.invoices = { synced: 0, error: err.message }
        }
      }
    }

    // ── Sales Orders ───────────────────────────────────────────────────
    if (requestedTables.includes('salesOrders')) {
      const tConfig = config.salesOrders
      const tStatus = status.salesOrders

      if (!force && !tConfig.enabled) {
        results.salesOrders = { synced: 0, skipped: 'disabled' }
      } else if (!force && !isTableStale(tStatus, tConfig)) {
        results.salesOrders = { synced: 0, skipped: 'fresh' }
      } else {
        try {
          const sinceParam = tStatus.lastSyncAt
            ? `&last_modified_time=${encodeURIComponent(tStatus.lastSyncAt)}`
            : ''
          const zRes = await fetch(
            `https://www.zohoapis.${ZOHO_DC}/books/v3/salesorders?organization_id=${ZOHO_ORGANIZATION_ID}&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`,
            { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zOrders = zData.salesorders || []

            for (const so of zOrders) {
              if (!so.salesorder_id) continue

              // Resolve local account: try customer_id first, then fall back to customer_name
              let localAccount = so.customer_id
                ? await prisma.account.findFirst({ where: { zohoId: so.customer_id } })
                : null
              if (!localAccount && so.customer_name) {
                localAccount = await prisma.account.findFirst({ where: { name: so.customer_name } })
              }

              // Check if record already exists (for update without requiring account)
              const existingSO = await prisma.salesOrder.findUnique({ where: { zohoId: so.salesorder_id } })
              const soAccountId = localAccount?.id || existingSO?.accountId
              if (!soAccountId) continue  // skip only if no account can be resolved at all

              await prisma.salesOrder.upsert({
                where: { zohoId: so.salesorder_id },
                update: {
                  status: so.status,
                  amount: parseFloat(so.total || 0),
                  items: so as any,
                },
                create: {
                  zohoId: so.salesorder_id,
                  accountId: soAccountId,
                  status: so.status,
                  amount: parseFloat(so.total || 0),
                  orderDate: so.date ? new Date(so.date) : new Date(),
                  items: so as any,
                },
              })
              syncedCount++
            }
          }

          await updateTableSyncStatus('salesOrders', {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.salesOrders = { synced: syncedCount }
        } catch (err: any) {
          await updateTableSyncStatus('salesOrders', { lastError: err.message })
          results.salesOrders = { synced: 0, error: err.message }
        }
      }
    }

    // ── Accounts ───────────────────────────────────────────────────────
    if (requestedTables.includes('accounts')) {
      const tConfig = config.accounts
      const tStatus = status.accounts

      if (!force && !tConfig.enabled) {
        results.accounts = { synced: 0, skipped: 'disabled' }
      } else if (!force && !isTableStale(tStatus, tConfig)) {
        results.accounts = { synced: 0, skipped: 'fresh' }
      } else {
        try {
          // Accounts come from Zoho CRM (not Books)
          const sinceParam = tStatus.lastSyncAt
            ? `&last_modified_time=${encodeURIComponent(tStatus.lastSyncAt)}`
            : ''
          const zRes = await fetch(
            `https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts?per_page=200&sort_by=Modified_Time&sort_order=desc${sinceParam}`,
            { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zAccounts = zData.data || []

            const ownerIds = Array.from(
              new Set(zAccounts.map((r: any) => r.Owner?.id).filter(Boolean))
            ) as string[]
            const existingOwners = await prisma.user.findMany({
              where: { zohoId: { in: ownerIds } },
            })
            const ownerMap = new Map(existingOwners.map(u => [u.zohoId, u]))

            for (const record of zAccounts) {
              if (!record.Owner?.id) continue
              const owner = ownerMap.get(record.Owner.id) as any
              if (!owner?.id) continue

              const lastPurchaseDate = record.Last_Purchase_Date
                ? new Date(record.Last_Purchase_Date)
                : null

              let acctStatus = 'Open'
              if (lastPurchaseDate) {
                const twelveMonthsAgo = new Date()
                twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
                acctStatus = lastPurchaseDate < twelveMonthsAgo ? 'Update Status' : 'Personal'
              }

              await prisma.account.upsert({
                where: { zohoId: record.id },
                update: {
                  name: record.Account_Name,
                  industry: record.Industry,
                  status: acctStatus,
                  lastPurchaseAt: lastPurchaseDate,
                  ownerId: owner.id,
                  timeZone: record.Time_Zone || null,
                },
                create: {
                  zohoId: record.id,
                  name: record.Account_Name,
                  industry: record.Industry,
                  status: acctStatus,
                  lastPurchaseAt: lastPurchaseDate,
                  ownerId: owner.id,
                  timeZone: record.Time_Zone || null,
                },
              })
              syncedCount++
            }
          }

          await updateTableSyncStatus('accounts', {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.accounts = { synced: syncedCount }
        } catch (err: any) {
          await updateTableSyncStatus('accounts', { lastError: err.message })
          results.accounts = { synced: 0, error: err.message }
        }
      }
    }

    // ── Packages ──────────────────────────────────────────────────────────
    if (requestedTables.includes('packages')) {
      const tConfig = config.packages
      const tStatus = status.packages

      if (!force && !tConfig.enabled) {
        results.packages = { synced: 0, skipped: 'disabled' }
      } else if (!force && !isTableStale(tStatus, tConfig)) {
        results.packages = { synced: 0, skipped: 'fresh' }
      } else {
        try {
          const sinceParam = tStatus.lastSyncAt
            ? `&last_modified_time=${encodeURIComponent(tStatus.lastSyncAt)}`
            : ''
          const zRes = await fetch(
            `https://www.zohoapis.${ZOHO_DC}/books/v3/packages?organization_id=${ZOHO_ORGANIZATION_ID}&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`,
            { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zPackages = zData.packages || []

            for (const pkg of zPackages) {
              if (!pkg.package_id) continue

              const pkgData = {
                packageNumber: pkg.package_number,
                salesOrderId: pkg.salesorder_id,
                salesOrderNumber: pkg.salesorder_number,
                date: pkg.date ? new Date(pkg.date) : null,
                status: pkg.status,
                carrier: pkg.delivery_method || pkg.shipping_carrier,
                trackingNumber: pkg.tracking_number,
                shippingCharge: pkg.shipping_charge || 0,
                items: pkg.line_items ? { lineItems: pkg.line_items } : Prisma.JsonNull,
              }

              await prisma.package.upsert({
                where: { zohoId: pkg.package_id },
                update: pkgData,
                create: { zohoId: pkg.package_id, ...pkgData },
              })
              syncedCount++
            }
          }

          await updateTableSyncStatus('packages' as any, {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.packages = { synced: syncedCount }
        } catch (err: any) {
          await updateTableSyncStatus('packages' as any, { lastError: err.message })
          results.packages = { synced: 0, error: err.message }
        }
      }
    }

    // ── Purchase Orders ───────────────────────────────────────────────────
    if (requestedTables.includes('purchaseOrders')) {
      const tConfig = config.purchaseOrders
      const tStatus = status.purchaseOrders

      if (!force && !tConfig.enabled) {
        results.purchaseOrders = { synced: 0, skipped: 'disabled' }
      } else if (!force && !isTableStale(tStatus, tConfig)) {
        results.purchaseOrders = { synced: 0, skipped: 'fresh' }
      } else {
        try {
          const sinceParam = tStatus.lastSyncAt
            ? `&last_modified_time=${encodeURIComponent(tStatus.lastSyncAt)}`
            : ''
          const zRes = await fetch(
            `https://www.zohoapis.${ZOHO_DC}/books/v3/purchaseorders?organization_id=${ZOHO_ORGANIZATION_ID}&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`,
            { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zPurchaseOrders = zData.purchaseorders || []

            for (const po of zPurchaseOrders) {
              if (!po.purchaseorder_id) continue

              const poData = {
                vendorName: po.vendor_name,
                shipToName: po.delivery_customer_name || po.customer_name,
                referenceNumber: po.reference_number || po.salesorder_number,
                date: po.date ? new Date(po.date) : null,
                total: po.total || 0,
                status: po.status,
                salesOrderId: po.salesorder_id,
                salesOrderNumber: po.salesorder_number || po.reference_number,
                isDropshipment: !!(po.delivery_customer_id || po.salesorder_id),
                trackingNumber: po.tracking_number,
                items: po.line_items ? { lineItems: po.line_items } : Prisma.JsonNull,
              }

              await prisma.purchaseOrder.upsert({
                where: { zohoId: po.purchaseorder_id },
                update: poData,
                create: { zohoId: po.purchaseorder_id, ...poData },
              })
              syncedCount++
            }
          }

          await updateTableSyncStatus('purchaseOrders' as any, {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.purchaseOrders = { synced: syncedCount }
        } catch (err: any) {
          await updateTableSyncStatus('purchaseOrders' as any, { lastError: err.message })
          results.purchaseOrders = { synced: 0, error: err.message }
        }
      }
    }

    // ── Quotes ──────────────────────────────────────────────────────────
    if (requestedTables.includes('quotes')) {
      const tConfig = config.quotes
      const tStatus = status.quotes

      if (!force && !tConfig.enabled) {
        results.quotes = { synced: 0, skipped: 'disabled' }
      } else if (!force && !isTableStale(tStatus, tConfig)) {
        results.quotes = { synced: 0, skipped: 'fresh' }
      } else {
        try {
          const sinceParam = tStatus.lastSyncAt
            ? `&last_modified_time=${encodeURIComponent(tStatus.lastSyncAt)}`
            : ''
          const zRes = await fetch(
            `https://www.zohoapis.${ZOHO_DC}/books/v3/estimates?organization_id=${ZOHO_ORGANIZATION_ID}&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`,
            { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zEstimates = zData.estimates || []

            for (const est of zEstimates) {
              if (!est.estimate_id) continue

              // Resolve local account: try customer_id first, then fall back to customer_name
              let localAccount = est.customer_id
                ? await prisma.account.findFirst({ where: { zohoId: est.customer_id } })
                : null
              if (!localAccount && est.customer_name) {
                localAccount = await prisma.account.findFirst({ where: { name: est.customer_name } })
              }

              const existingQuote = await prisma.quote.findUnique({ where: { zohoId: est.estimate_id } })
              const quoteAccountId = localAccount?.id || existingQuote?.accountId
              if (!quoteAccountId) continue

              const quoteData = {
                status: est.status,
                amount: parseFloat(est.total || 0),
                items: est as any,
                validUntil: est.expiry_date ? new Date(est.expiry_date) : undefined,
                rawData: est as any,
              }

              await prisma.quote.upsert({
                where: { zohoId: est.estimate_id },
                update: quoteData,
                create: { 
                  zohoId: est.estimate_id,
                  accountId: quoteAccountId,
                  ...quoteData
                },
              })
              syncedCount++
            }
          }

          await updateTableSyncStatus('quotes' as any, {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.quotes = { synced: syncedCount }
        } catch (err: any) {
          await updateTableSyncStatus('quotes' as any, { lastError: err.message })
          results.quotes = { synced: 0, error: err.message }
        }
      }
    }

    // ── Payments ────────────────────────────────────────────────────────
    if (requestedTables.includes('payments')) {
      const tConfig = config.payments
      const tStatus = status.payments

      if (!force && !tConfig.enabled) {
        results.payments = { synced: 0, skipped: 'disabled' }
      } else if (!force && !isTableStale(tStatus, tConfig)) {
        results.payments = { synced: 0, skipped: 'fresh' }
      } else {
        try {
          const sinceParam = tStatus.lastSyncAt
            ? `&last_modified_time=${encodeURIComponent(tStatus.lastSyncAt)}`
            : ''
          const zRes = await fetch(
            `https://www.zohoapis.${ZOHO_DC}/books/v3/customerpayments?organization_id=${ZOHO_ORGANIZATION_ID}&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`,
            { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zPayments = zData.customerpayments || []

            for (const pmt of zPayments) {
              if (!pmt.payment_id) continue

              const invoiceId = pmt.invoices?.[0]?.invoice_id || null
              const invoiceNumber = pmt.invoices?.[0]?.invoice_number || null
              
              let invoiceDbId: string | undefined = undefined
              if (invoiceId) {
                const localInvoice = await prisma.invoice.findFirst({ where: { zohoId: invoiceId } })
                if (localInvoice) invoiceDbId = localInvoice.id
              }

              const paymentData = {
                invoiceId,
                invoiceNumber,
                invoiceDbId,
                amount: parseFloat(pmt.amount || 0),
                date: pmt.date ? new Date(pmt.date) : null,
                mode: pmt.payment_mode,
                status: 'received',
                referenceNumber: pmt.reference_number,
                bankCharges: parseFloat(pmt.bank_charges || 0),
                description: pmt.description,
              }

              await prisma.payment.upsert({
                where: { zohoId: pmt.payment_id },
                update: paymentData,
                create: { zohoId: pmt.payment_id, ...paymentData },
              })
              syncedCount++
            }
          }

          await updateTableSyncStatus('payments' as any, {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.payments = { synced: syncedCount }
        } catch (err: any) {
          await updateTableSyncStatus('payments' as any, { lastError: err.message })
          results.payments = { synced: 0, error: err.message }
        }
      }
    }

    // ── Vendors ─────────────────────────────────────────────────────────
    if (requestedTables.includes('vendors')) {
      const tConfig = config.vendors
      const tStatus = status.vendors

      if (!force && !tConfig.enabled) {
        results.vendors = { synced: 0, skipped: 'disabled' }
      } else if (!force && !isTableStale(tStatus, tConfig)) {
        results.vendors = { synced: 0, skipped: 'fresh' }
      } else {
        try {
          const sinceParam = tStatus.lastSyncAt
            ? `&last_modified_time=${encodeURIComponent(tStatus.lastSyncAt)}`
            : ''
          const zRes = await fetch(
            `https://www.zohoapis.${ZOHO_DC}/books/v3/contacts?organization_id=${ZOHO_ORGANIZATION_ID}&contact_type=vendor&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`,
            { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zContacts = zData.contacts || []

            for (const v of zContacts) {
              if (!v.contact_id) continue

              const vendorData = {
                contactName: v.contact_name,
                companyName: v.company_name,
                email: v.email,
                phone: v.phone,
                status: v.status,
              }

              await prisma.vendor.upsert({
                where: { zohoId: v.contact_id },
                update: vendorData,
                create: { zohoId: v.contact_id, ...vendorData },
              })
              syncedCount++
            }
          }

          await updateTableSyncStatus('vendors' as any, {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.vendors = { synced: syncedCount }
        } catch (err: any) {
          await updateTableSyncStatus('vendors' as any, { lastError: err.message })
          results.vendors = { synced: 0, error: err.message }
        }
      }
    }

    // ── Products ────────────────────────────────────────────────────────
    if (requestedTables.includes('products')) {
      const tConfig = config.products
      const tStatus = status.products

      if (!force && !tConfig.enabled) {
        results.products = { synced: 0, skipped: 'disabled' }
      } else if (!force && !isTableStale(tStatus, tConfig)) {
        results.products = { synced: 0, skipped: 'fresh' }
      } else {
        try {
          const sinceParam = tStatus.lastSyncAt
            ? `&last_modified_time=${encodeURIComponent(tStatus.lastSyncAt)}`
            : ''
          const zRes = await fetch(
            `https://www.zohoapis.${ZOHO_DC}/books/v3/items?organization_id=${ZOHO_ORGANIZATION_ID}&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`,
            { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zItems = zData.items || []

            for (const item of zItems) {
              if (!item.sku) continue

              const productData = {
                name: item.name || item.item_name,
                description: item.description,
                price: parseFloat(item.rate || item.price || 0),
                category: item.group_name || 'General',
                stock: parseInt(item.stock_on_hand || 0),
              }

              await prisma.product.upsert({
                where: { sku: item.sku },
                update: productData,
                create: { sku: item.sku, ...productData },
              })
              syncedCount++
            }
          }

          await updateTableSyncStatus('products' as any, {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.products = { synced: syncedCount }
        } catch (err: any) {
          await updateTableSyncStatus('products' as any, { lastError: err.message })
          results.products = { synced: 0, error: err.message }
        }
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (err: any) {
    console.error('sync-now error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
