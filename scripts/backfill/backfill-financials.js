const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CC_FEE_RATE = 0.035; // 3.5%

async function run() {
  console.log("Starting Financial Backfill...");

  // 1. Process Purchase Orders
  const poFile = 'C:/Users/titan/Documents/Titan Diamond/invoices/Purchase_Order (10).csv';
  if (fs.existsSync(poFile)) {
    console.log(`\nParsing ${poFile}...`);
    const content = fs.readFileSync(poFile, 'utf8');
    const records = parse(content, { columns: true, skip_empty_lines: true, relax_quotes: true });

    const poMap = new Map();
    for (const row of records) {
      const zohoId = row['Purchase Order ID'];
      if (!zohoId) continue;

      if (!poMap.has(zohoId)) {
        poMap.set(zohoId, {
          zohoId,
          vendorName: row['Vendor Name'] || null,
          date: row['Purchase Order Date'] ? new Date(row['Purchase Order Date']) : null,
          total: parseFloat(row['Total'] || 0),
          status: row['Purchase Order Status'] || null,
          items: []
        });
      }

      if (row['Item Name']) {
        poMap.get(zohoId).items.push({
          name: row['Item Name'],
          sku: row['SKU'] || '',
          quantity: parseFloat(row['QuantityOrdered'] || 0),
          rate: parseFloat(row['Item Price'] || 0),
          itemTotal: parseFloat(row['Item Total'] || 0)
        });
      }
    }

    console.log(`Found ${poMap.size} unique Purchase Orders.`);
    let poUpdated = 0;
    for (const po of poMap.values()) {
      try {
        await prisma.purchaseOrder.upsert({
          where: { zohoId: po.zohoId },
          update: {
            vendorName: po.vendorName,
            date: po.date,
            total: po.total,
            status: po.status,
            items: po.items
          },
          create: {
            zohoId: po.zohoId,
            vendorName: po.vendorName,
            date: po.date,
            total: po.total,
            status: po.status,
            items: po.items
          }
        });
        poUpdated++;
        if (poUpdated % 500 === 0) console.log(`Processed ${poUpdated} POs...`);
      } catch (err) {
        console.error(`Error upserting PO ${po.zohoId}:`, err.message);
      }
    }
  }

  // 2. Process Payments and Calculate CC Fees
  const paymentFile = 'C:/Users/titan/Documents/Titan Diamond/invoices/Customer_Payment (3).csv';
  if (fs.existsSync(paymentFile)) {
    console.log(`\nParsing ${paymentFile}...`);
    const content = fs.readFileSync(paymentFile, 'utf8');
    const records = parse(content, { columns: true, skip_empty_lines: true, relax_quotes: true });

    // Track total CC fees per invoice so we can update the Invoice table accurately
    const invoiceCCFees = new Map(); // invoiceNumber -> total cc fees
    let paymentCount = 0;

    for (const row of records) {
      const zohoId = row['CustomerPayment ID'];
      if (!zohoId) continue;

      const invoiceNumber = row['Invoice Number'];
      const amount = parseFloat(row['Amount Applied to Invoice'] || row['Amount'] || 0);
      const mode = row['Mode'] || '';
      
      try {
        await prisma.payment.upsert({
          where: { zohoId },
          update: {
            invoiceNumber,
            amount,
            date: row['Date'] ? new Date(row['Date']) : null,
            mode,
            status: row['Payment Status'] || null,
            referenceNumber: row['Reference Number'] || null,
            bankCharges: parseFloat(row['Bank Charges'] || 0)
          },
          create: {
            zohoId,
            invoiceNumber,
            amount,
            date: row['Date'] ? new Date(row['Date']) : null,
            mode,
            status: row['Payment Status'] || null,
            referenceNumber: row['Reference Number'] || null,
            bankCharges: parseFloat(row['Bank Charges'] || 0)
          }
        });
        paymentCount++;
        if (paymentCount % 1000 === 0) console.log(`Processed ${paymentCount} Payments...`);

        // Check if this payment is a credit card payment
        const isCC = mode.toLowerCase().includes('credit') || 
                     mode.toLowerCase().includes('stripe') || 
                     mode.toLowerCase().includes('authorize');

        if (isCC && invoiceNumber && amount > 0) {
          const fee = amount * CC_FEE_RATE;
          const currentFees = invoiceCCFees.get(invoiceNumber) || 0;
          invoiceCCFees.set(invoiceNumber, currentFees + fee);
        }
      } catch (err) {
        console.error(`Error upserting Payment ${zohoId}:`, err.message);
      }
    }

    console.log(`\nFound ${invoiceCCFees.size} invoices with Credit Card fees to apply.`);
    
    // 3. Update Invoices with CC Fees
    console.log("Loading all invoices into memory to match by Invoice Number...");
    const allInvoices = await prisma.invoice.findMany({
      select: { zohoId: true, items: true }
    });
    
    // Build lookup map by invoiceNumber
    const invMap = new Map();
    for (const inv of allInvoices) {
      const num = inv.items?.invoiceNumber || inv.items?.invoice_number;
      if (num) invMap.set(num, inv);
    }

    let invoicesUpdated = 0;
    for (const [invoiceNumber, totalFee] of invoiceCCFees.entries()) {
      const dbInv = invMap.get(invoiceNumber);
      if (!dbInv) continue; // couldn't find the invoice locally
      
      let items = dbInv.items || {};
      let cfs = items.custom_fields || [];
      
      const cfLabel = "CREDIT CARD PROCESSING";
      const existing = cfs.find(c => c.label && c.label.toUpperCase().includes(cfLabel));
      
      if (existing) {
        existing.value = totalFee.toFixed(2);
      } else {
        cfs.push({ label: cfLabel, value: totalFee.toFixed(2) });
      }
      
      items.custom_fields = cfs;

      await prisma.invoice.update({
        where: { zohoId: dbInv.zohoId },
        data: { items }
      });
      invoicesUpdated++;
    }
    console.log(`Updated ${invoicesUpdated} Invoices with historical Credit Card Fees!`);
  }

}

run().catch(console.error).finally(() => prisma.$disconnect());
