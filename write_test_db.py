import os
import json
import subprocess

script = """
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const invoice = await prisma.invoice.findFirst({
    where: { items: { not: null } },
    orderBy: { createdAt: 'desc' }
  })
  const so = await prisma.salesOrder.findFirst({
    where: { items: { not: null } },
    orderBy: { createdAt: 'desc' }
  })
  const quote = await prisma.quote.findFirst({
    where: { items: { not: null } },
    orderBy: { createdAt: 'desc' }
  })

  console.log("INVOICE:", JSON.stringify(invoice, null, 2))
  console.log("SO:", JSON.stringify(so, null, 2))
  console.log("QUOTE:", JSON.stringify(quote, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
"""

with open("test_db.js", "w") as f:
    f.write(script)
