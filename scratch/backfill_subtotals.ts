import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Starting backfill for invoice amounts and subtotals...")

  // 1. Backfill Invoices
  const invoices = await prisma.invoice.findMany()
  console.log(`Found ${invoices.length} invoices to check.`)
  let invoicesUpdated = 0
  const invoiceOps = []

  for (const inv of invoices) {
    const items = (inv.items as any) || {}
    const shippingCharge = parseFloat(items.shipping_charge || 0)
    
    // Determine target subtotal: total amount minus shipping charge
    const targetSubtotal = Math.max(0, inv.amount - shippingCharge)
    let needsUpdate = false

    if (items.sub_total === undefined || items.sub_total !== targetSubtotal) {
      items.sub_total = targetSubtotal
      needsUpdate = true
    }

    // Update the invoice amount column to store the subtotal
    const currentAmount = inv.amount
    if (currentAmount !== targetSubtotal) {
      needsUpdate = true
    }

    if (needsUpdate) {
      invoiceOps.push(
        prisma.invoice.update({
          where: { id: inv.id },
          data: {
            amount: targetSubtotal,
            items: items
          }
        })
      )
      invoicesUpdated++
    }
  }

  if (invoiceOps.length > 0) {
    // Run in chunks of 100 to prevent database locks or memory issues
    const chunkSize = 100
    for (let i = 0; i < invoiceOps.length; i += chunkSize) {
      const chunk = invoiceOps.slice(i, i + chunkSize)
      await prisma.$transaction(chunk)
      console.log(`Updated invoice chunk ${i / chunkSize + 1}/${Math.ceil(invoiceOps.length / chunkSize)}`)
    }
  }
  console.log(`Successfully backfilled ${invoicesUpdated} invoices.`)

  // 2. Backfill Sales Orders
  const salesOrders = await prisma.salesOrder.findMany()
  console.log(`Found ${salesOrders.length} sales orders to check.`)
  let sosUpdated = 0
  const soOps = []

  for (const so of salesOrders) {
    const items = (so.items as any) || {}
    let needsUpdate = false

    if (items.sub_total === undefined) {
      items.sub_total = so.amount
      needsUpdate = true
    }

    if (needsUpdate) {
      soOps.push(
        prisma.salesOrder.update({
          where: { id: so.id },
          data: {
            items: items
          }
        })
      )
      sosUpdated++
    }
  }

  if (soOps.length > 0) {
    const chunkSize = 100
    for (let i = 0; i < soOps.length; i += chunkSize) {
      const chunk = soOps.slice(i, i + chunkSize)
      await prisma.$transaction(chunk)
      console.log(`Updated sales order chunk ${i / chunkSize + 1}/${Math.ceil(soOps.length / chunkSize)}`)
    }
  }
  console.log(`Successfully backfilled ${sosUpdated} sales orders.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
