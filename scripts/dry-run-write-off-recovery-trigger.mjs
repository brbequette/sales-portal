import { createHash } from "node:crypto"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const hash = value => createHash("sha256").update(String(value)).digest("hex").slice(0, 12)

function observation(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { present: false }
  let present = Object.prototype.hasOwnProperty.call(payload, "cf_written_off")
  let value = payload.cf_written_off
  if (!present && payload.custom_field_hash && typeof payload.custom_field_hash === "object") {
    present = Object.prototype.hasOwnProperty.call(payload.custom_field_hash, "cf_written_off")
    value = payload.custom_field_hash.cf_written_off
  }
  if (!present && Array.isArray(payload.custom_fields)) {
    const field = payload.custom_fields.find(item => item && typeof item === "object" && item.api_name === "cf_written_off")
    if (field) { present = true; value = field.value }
  }
  if (!present) return { present: false }
  if (typeof value !== "boolean") return { present: true, malformed: true }
  return { present: true, value }
}

try {
  const report = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '20s'")
    const invoices = await tx.invoice.findMany({ select: { id: true, zohoId: true, items: true, writeOffRecoveryCases: { select: { id: true } } } })
    const qualifying = []
    let malformedCount = 0
    for (const invoice of invoices) {
      const parsed = observation(invoice.items)
      if (parsed.malformed) malformedCount += 1
      if (parsed.value === true) qualifying.push({ id: hash(invoice.zohoId), hasCase: invoice.writeOffRecoveryCases.length > 0 })
    }
    return {
      scannedInvoiceCount: invoices.length,
      qualifyingCount: qualifying.length,
      qualifyingWithoutCaseCount: qualifying.filter(item => !item.hasCase).length,
      malformedCount,
      sanitizedInvoiceIds: qualifying.map(item => item.id).sort(),
    }
  }, { timeout: 30_000 })
  process.stdout.write(`${JSON.stringify(report)}\n`)
} finally {
  await prisma.$disconnect()
}
