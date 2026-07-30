import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const prod = await prisma.product.findFirst({
    where: {
      OR: [
        { sku: { equals: "UPC24L30S", mode: "insensitive" } },
        { name: { contains: "UPC24L30S", mode: "insensitive" } }
      ]
    }
  })
  console.log("DB Product for UPC24L30S:", JSON.stringify(prod, null, 2))

  const count = await prisma.product.count()
  console.log("Total DB Products count:", count)
}

main().catch(console.error).finally(() => prisma.$disconnect())
