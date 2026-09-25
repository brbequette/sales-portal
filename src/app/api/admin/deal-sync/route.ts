import { NextResponse } from 'next/server'
import { requireAdministrator } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { CONFIG_KEY, getDealSyncConfig, crmMetadata, validateDealSyncConfig } from '@/lib/deal-crm-sync'
import { runDealSyncBatch } from '@/lib/deal-sync-worker'
export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  const auth = await requireAdministrator(); if (auth.errorResponse) return auth.errorResponse
  const [config, invoiceCount, missingLinks, jobs, missingCrmMappings, coverage] = await Promise.all([
    getDealSyncConfig(), prisma.invoice.count(), prisma.invoice.count({ where: { dealId: null } }),
    prisma.$queryRaw`SELECT "invoiceId", "checkedAt", "attempts", "lastError" FROM "DealSyncJob" WHERE "lastError" IS NOT NULL ORDER BY "nextAttemptAt" DESC LIMIT 100`,
    prisma.invoice.count({ where: { account: { crmAccountId: null } } }),
    prisma.$queryRaw`SELECT count(*)::int AS total, count(*) FILTER (WHERE "checkedAt" IS NULL OR "changedAt">"checkedAt")::int AS pending, count(*) FILTER (WHERE "lastError" IS NOT NULL)::int AS exceptions FROM "DealSyncJob"`,
  ])
  let fields, metadataError
  if (new URL(req.url).searchParams.has('metadata')) {
    try { fields = await crmMetadata() } catch (error) { metadataError = error instanceof Error ? error.message : 'CRM_METADATA_UNAVAILABLE' }
  }
  return NextResponse.json({ config, invoiceCount, missingLinks, missingCrmMappings, coverage, exceptions: jobs, fields, metadataError })
}
export async function POST(req: Request) {
  const auth = await requireAdministrator(); if (auth.errorResponse) return auth.errorResponse
  try {
    const body = await req.json()
    if (body.action === 'run') return NextResponse.json(await runDealSyncBatch(5))
    if (body.action !== 'configure') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    const config = { enabled: body.config?.enabled === true, identityField: String(body.config?.identityField || ''), portalUrl: String(body.config?.portalUrl || ''), stages: body.config?.stages || {}, pipeline: String(body.config?.pipeline || '') }
    if (config.enabled) validateDealSyncConfig(config, await crmMetadata())
    await prisma.$transaction(async tx => {
      await tx.systemSetting.upsert({ where: { key: CONFIG_KEY }, update: { value: JSON.stringify(config) }, create: { key: CONFIG_KEY, value: JSON.stringify(config) } })
      await tx.operationalEvent.create({ data: { entityType: 'integration', entityId: CONFIG_KEY, eventType: 'DEAL_SYNC_CONFIGURED', title: config.enabled ? 'Invoice deal sync enabled' : 'Invoice deal sync paused', actorId: auth.session?.user.dbId, metadata: config } })
    })
    return NextResponse.json({ success: true, config })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Deal sync failed' }, { status: 409 })
  }
}
