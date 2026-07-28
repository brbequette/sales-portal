import "dotenv/config"
import { prisma } from "../netlify/functions/lib/prisma"

async function inspectInvoice10920() {
  console.log("=== INSPECTING INVOICE 10920 & PRODUCT UPC24L30S ===")

  // 1. Fetch Invoice 10920
  const invoice = await prisma.invoice.findFirst({
    where: { invoice_number: { contains: "10920" } }
  })

  if (!invoice) {
    console.log("Invoice 10920 not found by invoice_number, searching in items/rawData...")
    const allInvoices = await prisma.invoice.findMany()
    const match = allInvoices.find(inv => {
      const raw = (inv.rawData as any) || {}
      const items = (inv.items as any) || {}
      return inv.invoice_number?.includes("10920") || raw.invoice_number?.includes("10920") || items.invoice_number?.includes("10920")
    })
    console.log("Matched Invoice:", match ? match.id : "NONE")
    if (match) {
      console.log("Items JSON:", JSON.stringify(match.items, null, 2))
    }
  } else {
    console.log("Invoice ID:", invoice.id)
    console.log("Invoice Number:", invoice.invoice_number)
    console.log("Items JSON:", JSON.stringify(invoice.items, null, 2))
  }

  // 2. Fetch Product UPC24L30S
  const product = await prisma.product.findFirst({
    where: {
      OR: [
        { sku: { contains: "UPC24L30S", mode: "insensitive" } },
        { name: { contains: "UPC24L30S", mode: "insensitive" } },
        { zohoId: { contains: "UPC24L30S", mode: "insensitive" } }
      ]
    }
  })

  console.log("\nProduct UPC24L30S in DB:")
  if (product) {
    console.log("Product Name:", product.name)
    console.log("SKU:", product.sku)
    console.log("Subject to VIG:", (product as any).subjectToVig)
    console.log("Subject to Sales Markup:", (product as any).subjectToSalesMarkup)
    console.log("Custom Fields:", JSON.stringify((product as any).customFields, null, 2))
    console.log("Raw Data:", JSON.stringify((product as any).rawData || {}, null, 2))
  } else {
    console.log("Product UPC24L30S not found in local DB table")
  }

  await prisma.$disconnect()
}

inspectInvoice10920().catch(err => {
  console.error("Error inspecting 10920:", err)
  prisma.$disconnect()
})
