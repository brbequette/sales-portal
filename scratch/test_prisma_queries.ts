import { prisma } from "../src/lib/prisma"

async function main() {
  const startDate = new Date("2026-01-01T00:00:00.000Z")
  
  const invoices = await prisma.invoice.findMany({
    where: {
      issueDate: { gte: startDate }
    },
    include: {
      account: {
        select: {
          name: true,
          zohoId: true,
          ownerId: true
        }
      }
    }
  })

  console.log(`Prisma returned: ${invoices.length} Invoices`)

  // Let's print out the first 5 invoices' issue dates
  invoices.slice(0, 5).forEach((inv, i) => {
    console.log(`Invoice ${i}: id=${inv.id}, issueDate=${inv.issueDate.toISOString()}, status=${inv.status}`)
  })
}

main().catch(console.error).finally(() => prisma.$disconnect())
