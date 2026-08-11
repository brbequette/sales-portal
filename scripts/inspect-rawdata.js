const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function inspect() {
  // Check the items JSON for salesperson data
  const samples = await p.$queryRaw`
    SELECT id, "items"::text as items_text, "computedSalesperson", "computedInvoiceNumber", "amount", "status"
    FROM "Invoice" 
    WHERE "items" IS NOT NULL 
    AND length("items"::text) > 10
    ORDER BY "updatedAt" DESC
    LIMIT 3`
  
  for (const inv of samples) {
    const items = JSON.parse(inv.items_text)
    console.log(`\n=== Invoice ${inv.id} (status: ${inv.status}, amount: ${inv.amount}) ===`)
    console.log('Items keys:', Object.keys(items).join(', '))
    console.log('salesperson_name:', items.salesperson_name || 'NOT FOUND')
    console.log('invoice_number:', items.invoice_number || 'NOT FOUND')
    console.log('customer_name:', items.customer_name || 'NOT FOUND')
    console.log('total:', items.total)
    console.log('sub_total:', items.sub_total)
    console.log('computedSalesperson column:', inv.computedSalesperson || 'NULL')
    console.log('computedInvoiceNumber column:', inv.computedInvoiceNumber || 'NULL')
    
    // Check custom fields
    if (items.custom_fields) {
      console.log('Custom fields:')
      for (const cf of items.custom_fields) {
        console.log(`  ${cf.label}: "${cf.value}"`)
      }
    }
  }

  // Count how many have salesperson in items
  const withSp = await p.$queryRaw`
    SELECT COUNT(*) as cnt FROM "Invoice" 
    WHERE "items" IS NOT NULL 
    AND "items"::text LIKE '%salesperson_name%'
    AND "items"->>'salesperson_name' IS NOT NULL 
    AND "items"->>'salesperson_name' != ''`
  console.log(`\nInvoices with salesperson in items JSON: ${Number(withSp[0].cnt)}`)

  const withInvNum = await p.$queryRaw`
    SELECT COUNT(*) as cnt FROM "Invoice" 
    WHERE "items" IS NOT NULL 
    AND "items"->>'invoice_number' IS NOT NULL 
    AND "items"->>'invoice_number' != ''`
  console.log(`Invoices with invoice_number in items JSON: ${Number(withInvNum[0].cnt)}`)

  await p.$disconnect()
}
inspect().catch(e => { console.error(e.message); process.exit(1) })
