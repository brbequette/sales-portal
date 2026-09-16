import { PrismaClient } from "@prisma/client"

async function main() {
const prisma = new PrismaClient()
try {
  const evidence = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")
    const writtenOff = await tx.$queryRawUnsafe(`
      SELECT count(*)::int AS count,
             coalesce(sum("writtenOffCostDeduction"), 0)::text AS deduction
      FROM "Invoice"
      WHERE "isWrittenOff" = true
         OR lower(status) IN ('written_off', 'writeoff', 'write_off', 'bad debt')
    `)
    const clawbacks = await tx.$queryRawUnsafe(`
      SELECT status, count(*)::int AS count,
             coalesce(sum("totalRepLoss"), 0)::text AS loss,
             coalesce(sum("commissionClawed"), 0)::text AS commission
      FROM "ClawbackTransaction"
      GROUP BY status ORDER BY status
    `)
    const mappings = await tx.$queryRawUnsafe(`
      SELECT entity, "apiName", "internalKey", "dataType", "isActive"
      FROM "CustomFieldMapping"
      WHERE entity IN ('INVOICE', 'SALESORDER')
      ORDER BY entity, "apiName"
    `)
    const roles = await tx.$queryRawUnsafe(`
      SELECT role, count(*)::int AS count FROM "User" GROUP BY role ORDER BY role
    `)
    const storedCostFields = await tx.$queryRawUnsafe(`
      SELECT key, count(*)::int AS count
      FROM "Invoice" i
      CROSS JOIN LATERAL jsonb_object_keys(coalesce(i.items, '{}'::jsonb)) key
      WHERE key ~* '(cost|freight|ship|tariff|fee|gift|refund|return|write|commission)'
      GROUP BY key ORDER BY key
    `)
    return { writtenOff, clawbacks, mappings, roles, storedCostFields }
  }, { isolationLevel: "Serializable" })
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  await prisma.$disconnect()
}
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Write-off audit failed")
  process.exitCode = 1
})
