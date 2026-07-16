import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

/**
 * One-time migration: adds cost-sync tracking columns to Invoice, SalesOrder, Quote.
 * Safe to run multiple times (uses IF NOT EXISTS). 
 * Call via GET /.netlify/functions/run-migration?secret=<MIGRATION_SECRET>
 */
export const handler: Handler = async (event) => {
  // One-time token — delete this function after running migration
  const ALLOWED_TOKEN = "titan-migrate-cost-sync-2026"
  const secret = event.queryStringParameters?.secret
  if (!secret || secret !== ALLOWED_TOKEN) {
    return {
      statusCode: 401,
      body: JSON.stringify({ success: false, message: "Unauthorized" })
    }
  }

  const results: string[] = []

  try {
    // Add columns to Invoice
    await prisma.$executeRawUnsafe(`ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "pendingCostSync" BOOLEAN NOT NULL DEFAULT false`)
    results.push("Invoice.pendingCostSync: OK")
    await prisma.$executeRawUnsafe(`ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "costsCalculatedAt" TIMESTAMP(3)`)
    results.push("Invoice.costsCalculatedAt: OK")
    await prisma.$executeRawUnsafe(`ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "lastCostSyncAt" TIMESTAMP(3)`)
    results.push("Invoice.lastCostSyncAt: OK")

    // Add index for Invoice.pendingCostSync (idempotent via DO block)
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='Invoice' AND indexname='Invoice_pendingCostSync_idx') THEN
          CREATE INDEX "Invoice_pendingCostSync_idx" ON "Invoice"("pendingCostSync");
        END IF;
      END $$;
    `)
    results.push("Invoice.pendingCostSync index: OK")

    // Add columns to SalesOrder
    await prisma.$executeRawUnsafe(`ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "pendingCostSync" BOOLEAN NOT NULL DEFAULT false`)
    results.push("SalesOrder.pendingCostSync: OK")
    await prisma.$executeRawUnsafe(`ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "costsCalculatedAt" TIMESTAMP(3)`)
    results.push("SalesOrder.costsCalculatedAt: OK")
    await prisma.$executeRawUnsafe(`ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "lastCostSyncAt" TIMESTAMP(3)`)
    results.push("SalesOrder.lastCostSyncAt: OK")

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='SalesOrder' AND indexname='SalesOrder_pendingCostSync_idx') THEN
          CREATE INDEX "SalesOrder_pendingCostSync_idx" ON "SalesOrder"("pendingCostSync");
        END IF;
      END $$;
    `)
    results.push("SalesOrder.pendingCostSync index: OK")

    // Add columns to Quote
    await prisma.$executeRawUnsafe(`ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "pendingCostSync" BOOLEAN NOT NULL DEFAULT false`)
    results.push("Quote.pendingCostSync: OK")
    await prisma.$executeRawUnsafe(`ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "costsCalculatedAt" TIMESTAMP(3)`)
    results.push("Quote.costsCalculatedAt: OK")
    await prisma.$executeRawUnsafe(`ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "lastCostSyncAt" TIMESTAMP(3)`)
    results.push("Quote.lastCostSyncAt: OK")

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='Quote' AND indexname='Quote_pendingCostSync_idx') THEN
          CREATE INDEX "Quote_pendingCostSync_idx" ON "Quote"("pendingCostSync");
        END IF;
      END $$;
    `)
    results.push("Quote.pendingCostSync index: OK")

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, results })
    }
  } catch (err: any) {
    console.error("Migration error:", err)
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: err.message, results })
    }
  } finally {
    await prisma.$disconnect()
  }
}
