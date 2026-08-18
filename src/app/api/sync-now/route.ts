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
const TIMEOUT_MS = 55000;
const BATCH_SIZE = 50;

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let lockAcquired = false;
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const lock = await prisma.systemSetting.findUnique({ where: { key: 'sync_in_progress' } })
    if (lock?.value === 'true') {
      const lockTime = lock.updatedAt ? new Date(lock.updatedAt).getTime() : 0
      if (Date.now() - lockTime < 10 * 60 * 1000) { // 10 min max lock
        return NextResponse.json({ error: 'Sync already in progress' }, { status: 429 })
      }
    }
    await prisma.systemSetting.upsert({
      where: { key: 'sync_in_progress' },
      update: { value: 'true' },
      create: { key: 'sync_in_progress', value: 'true' }
    })
    lockAcquired = true;

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
            `https://www.zohoapis.${ZOHO_DC}/crm/v3/Leads?per_page=200&sort_by=Modified_Time&sort_order=desc${sinceParam}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0;
          let timeoutReached = false;
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zLeads = zData.data || []

            const allUsers = await prisma.user.findMany({ select: { id: true, email: true, zohoId: true } })
            const userByZohoId = new Map(allUsers.filter(u => u.zohoId).map(u => [u.zohoId, u]))
            const userByEmail = new Map(allUsers.filter(u => u.email).map(u => [u.email.toLowerCase(), u]))
            const sessionUser = allUsers.find(u => u.id === session.user.id)

            let batch: any[] = [];
            for (const zLead of zLeads) {
              if (Date.now() - startTime > TIMEOUT_MS) { timeoutReached = true; break; }
              if (!zLead.id) continue
              const ownerZohoId = zLead.Owner?.id
              let localUser: any = null
              if (ownerZohoId) {
                localUser = userByZohoId.get(ownerZohoId) || userByEmail.get((zLead.Owner?.email || '').toLowerCase())
              }
              if (!localUser && session.user.id) {
                localUser = sessionUser
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

              batch.push(prisma.lead.upsert({
                where: { zohoId: zLead.id },
                update: leadData,
                create: { zohoId: zLead.id, ownerId: localUser.id, ...leadData },
              }));
              if (batch.length >= BATCH_SIZE) { await prisma.$transaction(batch); syncedCount += batch.length; batch = []; }
            }
          }

          await updateTableSyncStatus('leads', {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.leads = { synced: syncedCount };
          if (timeoutReached) { results.leads.error = 'timeout reached'; }
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
            `https://www.zohoapis.${ZOHO_DC}/books/v3/invoices?organization_id=${ZOHO_ORGANIZATION_ID}&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0;
          let timeoutReached = false;
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zInvoices = zData.invoices || []

            const allAccounts = await prisma.account.findMany({ select: { id: true, zohoId: true, name: true } })
            const accountByZohoId = new Map(allAccounts.filter(a => a.zohoId).map(a => [a.zohoId, a]))
            const accountByName = new Map(allAccounts.map(a => [a.name?.toLowerCase(), a]))

            const existingInvoices = await prisma.invoice.findMany({ select: { id: true, zohoId: true, accountId: true } })
            const invoiceByZohoId = new Map(existingInvoices.filter(i => i.zohoId).map(i => [i.zohoId, i]))

            let batch: any[] = [];
            for (const inv of zInvoices) {
              if (Date.now() - startTime > TIMEOUT_MS) { timeoutReached = true; break; }
              if (!inv.invoice_id) continue

              let localAccount = (inv.customer_id ? accountByZohoId.get(inv.customer_id) : null)
                || (inv.customer_name ? accountByName.get(inv.customer_name.toLowerCase()) : null);

              const existingInv = invoiceByZohoId.get(inv.invoice_id)
              const accountId = localAccount?.id || existingInv?.accountId
              if (!accountId) continue  // skip only if no account can be resolved at all

              const balStr = String(inv.balance ?? '0');
              const bal = parseFloat(balStr);
              const safeBal = isNaN(bal) ? 0 : bal;

              const totalStr = String(inv.total ?? '0');
              const total = parseFloat(totalStr);
              const safeTotal = isNaN(total) ? 0 : total;

              const issueDateStr = String(inv.date || '');
              const issueDate = Date.parse(issueDateStr) ? new Date(issueDateStr) : new Date();

              batch.push(prisma.invoice.upsert({
                where: { zohoId: inv.invoice_id },
                update: {
                  status: inv.status,
                  balance: safeBal,
                  amount: safeTotal,
                  issueDate: Date.parse(issueDateStr) ? new Date(issueDateStr) : undefined,
                  accountId: accountId,
                  items: inv as any,
                },
                create: {
                  zohoId: inv.invoice_id,
                  accountId: accountId,
                  status: inv.status,
                  balance: safeBal,
                  amount: safeTotal,
                  issueDate: issueDate,
                  items: inv as any,
                },
              }));
              if (batch.length >= BATCH_SIZE) { await prisma.$transaction(batch); syncedCount += batch.length; batch = []; }
            }
          }

          await updateTableSyncStatus('invoices', {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.invoices = { synced: syncedCount };
          if (timeoutReached) { results.invoices.error = 'timeout reached'; }
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
            `https://www.zohoapis.${ZOHO_DC}/books/v3/salesorders?organization_id=${ZOHO_ORGANIZATION_ID}&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0;
          let timeoutReached = false;
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zOrders = zData.salesorders || []

            const allAccounts = await prisma.account.findMany({ select: { id: true, zohoId: true, name: true } })
            const accountByZohoId = new Map(allAccounts.filter(a => a.zohoId).map(a => [a.zohoId, a]))
            const accountByName = new Map(allAccounts.map(a => [a.name?.toLowerCase(), a]))

            const existingSOs = await prisma.salesOrder.findMany({ select: { id: true, zohoId: true, accountId: true } })
            const soByZohoId = new Map(existingSOs.filter(i => i.zohoId).map(i => [i.zohoId, i]))

            let batch: any[] = [];
            for (const so of zOrders) {
              if (Date.now() - startTime > TIMEOUT_MS) { timeoutReached = true; break; }
              if (!so.salesorder_id) continue

              let localAccount = (so.customer_id ? accountByZohoId.get(so.customer_id) : null)
                || (so.customer_name ? accountByName.get(so.customer_name.toLowerCase()) : null);

              const existingSO = soByZohoId.get(so.salesorder_id)
              const soAccountId = localAccount?.id || existingSO?.accountId
              if (!soAccountId) continue  // skip only if no account can be resolved at all

              const totalStr = String(so.total ?? '0');
              const total = parseFloat(totalStr);
              const safeTotal = isNaN(total) ? 0 : total;

              const shippingStr = String(so.shipping_charge || so.shipping_charges || so.shippingCharge || '0');
              const shipping = parseFloat(shippingStr);
              const safeShipping = isNaN(shipping) ? undefined : shipping;

              const dateStr = String(so.date || '');
              const orderDate = Date.parse(dateStr) ? new Date(dateStr) : new Date();

              batch.push(prisma.salesOrder.upsert({
                where: { zohoId: so.salesorder_id },
                update: {
                  status: so.status,
                  amount: safeTotal,
                  items: so as any,
                  actualShippingCost: safeShipping,
                },
                create: {
                  zohoId: so.salesorder_id,
                  accountId: soAccountId,
                  status: so.status,
                  amount: safeTotal,
                  orderDate: orderDate,
                  items: so as any,
                  actualShippingCost: safeShipping,
                },
              }));
              if (batch.length >= BATCH_SIZE) { await prisma.$transaction(batch); syncedCount += batch.length; batch = []; }
            }
          }

          await updateTableSyncStatus('salesOrders', {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.salesOrders = { synced: syncedCount };
          if (timeoutReached) { results.salesOrders.error = 'timeout reached'; }
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
            `https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts?per_page=200&sort_by=Modified_Time&sort_order=desc${sinceParam}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0;
          let timeoutReached = false;
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

            let batch: any[] = [];
            for (const record of zAccounts) {
              if (Date.now() - startTime > TIMEOUT_MS) { timeoutReached = true; break; }
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

              batch.push(prisma.account.upsert({
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
              }));
              if (batch.length >= BATCH_SIZE) { await prisma.$transaction(batch); syncedCount += batch.length; batch = []; }
            }
          }

          await updateTableSyncStatus('accounts', {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.accounts = { synced: syncedCount };
          if (timeoutReached) { results.accounts.error = 'timeout reached'; }
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
            `https://www.zohoapis.${ZOHO_DC}/books/v3/packages?organization_id=${ZOHO_ORGANIZATION_ID}&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0;
          let timeoutReached = false;
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zPackages = zData.packages || []

            let batch: any[] = [];
            for (const pkg of zPackages) {
              if (Date.now() - startTime > TIMEOUT_MS) { timeoutReached = true; break; }
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

              batch.push(prisma.package.upsert({
                where: { zohoId: pkg.package_id },
                update: pkgData,
                create: { zohoId: pkg.package_id, ...pkgData },
              }));
              if (batch.length >= BATCH_SIZE) { await prisma.$transaction(batch); syncedCount += batch.length; batch = []; }
            }
          }

          await updateTableSyncStatus('packages' as any, {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.packages = { synced: syncedCount };
          if (timeoutReached) { results.packages.error = 'timeout reached'; }
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
            `https://www.zohoapis.${ZOHO_DC}/books/v3/purchaseorders?organization_id=${ZOHO_ORGANIZATION_ID}&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0;
          let timeoutReached = false;
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zPurchaseOrders = zData.purchaseorders || []

            let batch: any[] = [];
            for (const po of zPurchaseOrders) {
              if (Date.now() - startTime > TIMEOUT_MS) { timeoutReached = true; break; }
              if (!po.purchaseorder_id) continue

              const poData = {
                vendorName: po.vendor_name,
                shipToName: po.delivery_customer_name || po.customer_name || po.ship_via,
                referenceNumber: po.reference_number || po.salesorder_number,
                date: po.date ? new Date(po.date) : null,
                total: po.total || 0,
                status: po.status,
                salesOrderId: po.salesorder_id || null,
                salesOrderNumber: po.salesorder_number || po.reference_number || null,
                isDropshipment: !!(po.delivery_customer_id || po.salesorder_id || po.delivery_customer_name),
                trackingNumber: po.tracking_number || null,
                items: po as any, // store full PO response for richer data access
              }

              batch.push(prisma.purchaseOrder.upsert({
                where: { zohoId: po.purchaseorder_id },
                update: poData,
                create: { zohoId: po.purchaseorder_id, ...poData },
              }));
              if (batch.length >= BATCH_SIZE) { await prisma.$transaction(batch); syncedCount += batch.length; batch = []; }
            }
          }

          await updateTableSyncStatus('purchaseOrders' as any, {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.purchaseOrders = { synced: syncedCount };
          if (timeoutReached) { results.purchaseOrders.error = 'timeout reached'; }
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
            `https://www.zohoapis.${ZOHO_DC}/books/v3/estimates?organization_id=${ZOHO_ORGANIZATION_ID}&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0;
          let timeoutReached = false;
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zEstimates = zData.estimates || []

            const allAccounts = await prisma.account.findMany({ select: { id: true, zohoId: true, name: true } })
            const accountByZohoId = new Map(allAccounts.filter(a => a.zohoId).map(a => [a.zohoId, a]))
            const accountByName = new Map(allAccounts.map(a => [a.name?.toLowerCase(), a]))

            const existingQuotes = await prisma.quote.findMany({ select: { id: true, zohoId: true, accountId: true } })
            const quoteByZohoId = new Map(existingQuotes.filter(i => i.zohoId).map(i => [i.zohoId, i]))

            let batch: any[] = [];
            for (const est of zEstimates) {
              if (Date.now() - startTime > TIMEOUT_MS) { timeoutReached = true; break; }
              if (!est.estimate_id) continue

              let localAccount = (est.customer_id ? accountByZohoId.get(est.customer_id) : null)
                || (est.customer_name ? accountByName.get(est.customer_name.toLowerCase()) : null);

              const existingQuote = quoteByZohoId.get(est.estimate_id)
              const quoteAccountId = localAccount?.id || existingQuote?.accountId
              if (!quoteAccountId) continue

              const totalStr = String(est.total ?? '0');
              const total = parseFloat(totalStr);
              const safeTotal = isNaN(total) ? 0 : total;

              const dateStr = String(est.expiry_date || '');
              const expiryDate = Date.parse(dateStr) ? new Date(dateStr) : undefined;

              const quoteData = {
                status: est.status,
                amount: safeTotal,
                items: est as any,
                validUntil: expiryDate,
                rawData: est as any,
              }

              batch.push(prisma.quote.upsert({
                where: { zohoId: est.estimate_id },
                update: quoteData,
                create: { 
                  zohoId: est.estimate_id,
                  accountId: quoteAccountId,
                  ...quoteData
                },
              }));
              if (batch.length >= BATCH_SIZE) { await prisma.$transaction(batch); syncedCount += batch.length; batch = []; }
            }
          }

          await updateTableSyncStatus('quotes' as any, {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.quotes = { synced: syncedCount };
          if (timeoutReached) { results.quotes.error = 'timeout reached'; }
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
            `https://www.zohoapis.${ZOHO_DC}/books/v3/customerpayments?organization_id=${ZOHO_ORGANIZATION_ID}&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0;
          let timeoutReached = false;
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zPayments = zData.customerpayments || []

            const allInvoices = await prisma.invoice.findMany({ select: { id: true, zohoId: true } })
            const invoiceByZohoId = new Map(allInvoices.filter(i => i.zohoId).map(i => [i.zohoId, i]))

            let batch: any[] = [];
            for (const pmt of zPayments) {
              if (Date.now() - startTime > TIMEOUT_MS) { timeoutReached = true; break; }
              if (!pmt.payment_id) continue

              const invoiceId = pmt.invoices?.[0]?.invoice_id || null
              const invoiceNumber = pmt.invoices?.[0]?.invoice_number || null
              
              let invoiceDbId: string | undefined = undefined
              if (invoiceId) {
                const localInvoice = invoiceByZohoId.get(invoiceId)
                if (localInvoice) invoiceDbId = localInvoice.id
              }

              const amtStr = String(pmt.amount ?? '0');
              const amt = parseFloat(amtStr);
              const safeAmt = isNaN(amt) ? 0 : amt;

              const bankChargesStr = String(pmt.bank_charges ?? '0');
              const bankCharges = parseFloat(bankChargesStr);
              const safeBankCharges = isNaN(bankCharges) ? 0 : bankCharges;

              const dateStr = String(pmt.date || '');
              const pmtDate = Date.parse(dateStr) ? new Date(dateStr) : null;

              const paymentData = {
                invoiceId,
                invoiceNumber,
                invoiceDbId,
                amount: safeAmt,
                date: pmtDate,
                mode: pmt.payment_mode,
                status: 'received',
                referenceNumber: pmt.reference_number,
                bankCharges: safeBankCharges,
                description: pmt.description,
              }

              batch.push(prisma.payment.upsert({
                where: { zohoId: pmt.payment_id },
                update: paymentData,
                create: { zohoId: pmt.payment_id, ...paymentData },
              }));
              if (batch.length >= BATCH_SIZE) { await prisma.$transaction(batch); syncedCount += batch.length; batch = []; }
            }
          }

          await updateTableSyncStatus('payments' as any, {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.payments = { synced: syncedCount };
          if (timeoutReached) { results.payments.error = 'timeout reached'; }
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
            `https://www.zohoapis.${ZOHO_DC}/books/v3/contacts?organization_id=${ZOHO_ORGANIZATION_ID}&contact_type=vendor&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0;
          let timeoutReached = false;
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zContacts = zData.contacts || []

            let batch: any[] = [];
            for (const v of zContacts) {
              if (Date.now() - startTime > TIMEOUT_MS) { timeoutReached = true; break; }
              if (!v.contact_id) continue

              const vendorData = {
                contactName: v.contact_name,
                companyName: v.company_name,
                email: v.email,
                phone: v.phone,
                status: v.status,
              }

              batch.push(prisma.vendor.upsert({
                where: { zohoId: v.contact_id },
                update: vendorData,
                create: { zohoId: v.contact_id, ...vendorData },
              }));
              if (batch.length >= BATCH_SIZE) { await prisma.$transaction(batch); syncedCount += batch.length; batch = []; }
            }
          }

          await updateTableSyncStatus('vendors' as any, {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.vendors = { synced: syncedCount };
          if (timeoutReached) { results.vendors.error = 'timeout reached'; }
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
            `https://www.zohoapis.${ZOHO_DC}/books/v3/items?organization_id=${ZOHO_ORGANIZATION_ID}&per_page=200&sort_column=last_modified_time&sort_order=D${sinceParam}`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          )

          let syncedCount = 0;
          let timeoutReached = false;
          if (!zRes.ok) {
            const errText = await zRes.text().catch(() => '')
            console.error('Zoho API error:', zRes.status, errText.substring(0, 200))
            throw new Error(`Zoho API returned ${zRes.status}: ${errText.substring(0, 100)}`)
          }
          {
            const zData = await zRes.json()
            const zItems = zData.items || []

            let batch: any[] = [];
            for (const item of zItems) {
              if (Date.now() - startTime > TIMEOUT_MS) { timeoutReached = true; break; }
              if (!item.sku) continue

              const productData = {
                name: item.name || item.item_name,
                description: item.description,
                price: parseFloat(item.rate || item.price || 0),
                category: item.group_name || 'General',
                stock: parseInt(item.stock_on_hand || 0),
              }

              batch.push(prisma.product.upsert({
                where: { sku: item.sku },
                update: productData,
                create: { sku: item.sku, ...productData },
              }));
              if (batch.length >= BATCH_SIZE) { await prisma.$transaction(batch); syncedCount += batch.length; batch = []; }
            }
          }

          await updateTableSyncStatus('products' as any, {
            lastSyncAt: new Date().toISOString(),
            lastCount: syncedCount,
            lastError: null,
          })
          results.products = { synced: syncedCount };
          if (timeoutReached) { results.products.error = 'timeout reached'; }
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
  } finally {
    if (lockAcquired) {
      await prisma.systemSetting.update({ where: { key: 'sync_in_progress' }, data: { value: 'false' } }).catch(() => {})
    }
  }
}
