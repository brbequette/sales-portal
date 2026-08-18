const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("Starting CSV backfill...");
  
  const files = [
    'C:/Users/titan/Documents/Titan Diamond/invoices/Invoice00.csv',
    'C:/Users/titan/Documents/Titan Diamond/invoices/Invoice01.csv'
  ];

  const invoiceMap = new Map(); // zohoId -> { custom_fields: {}, line_items: [] }

  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.log(`Skipping ${file} - not found`);
      continue;
    }
    console.log(`Parsing ${file}...`);
    const content = fs.readFileSync(file, 'utf8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true
    });

    for (const row of records) {
      const zohoId = row['Invoice ID'];
      if (!zohoId) continue;

      if (!invoiceMap.has(zohoId)) {
        invoiceMap.set(zohoId, {
          custom_fields: {},
          line_items: []
        });
      }

      const invData = invoiceMap.get(zohoId);
      
      // Update custom fields (they are duplicated on every row, just take the last or first)
      const cfMapping = {
        'SALESPERSON VIG': 'CF.SALESPERSON VIG',
        'PROFIT': 'CF.PROFIT',
        'COMMISSION FROM PROFIT %': 'CF.COMMISSION FROM PROFIT %',
        'SALES COMMISSION': 'CF.SALES COMMISSION',
        'DEAD COST TOTAL': 'CF.DEAD COST TOTAL',
        'DEAD COST PLUS VIG': 'CF.DEAD COST PLUS VIG',
        'DEAD COST SUBJECT TO VIG': 'CF.DEAD COST SUBJECT TO VIG',
        'DEAD COST NO VIG': 'CF.DEAD COST NO VIG'
      };

      for (const [label, csvKey] of Object.entries(cfMapping)) {
        if (row[csvKey] !== undefined && row[csvKey] !== '') {
          // Extract numeric value from currency strings if needed
          let val = row[csvKey].replace(/[$,]/g, '');
          invData.custom_fields[label] = parseFloat(val) || 0;
        }
      }

      // Add line item
      if (row['Item Name']) {
        invData.line_items.push({
          name: row['Item Name'],
          sku: row['SKU'] || '',
          quantity: parseFloat(row['Quantity'] || 0),
          rate: parseFloat(row['Item Price'] || 0),
          item_total: parseFloat(row['Item Total'] || 0),
          description: row['Item Desc'] || ''
        });
      }
    }
  }

  console.log(`Found ${invoiceMap.size} unique invoices in CSVs.`);

  let updatedCount = 0;
  let skippedCount = 0;

  console.log("Updating local database...");

  // We do updates sequentially to avoid overwhelming the connection pool
  for (const [zohoId, csvData] of invoiceMap.entries()) {
    try {
      const dbInv = await prisma.invoice.findUnique({
        where: { zohoId }
      });

      if (!dbInv) {
        skippedCount++;
        continue;
      }

      let items = dbInv.items || {};
      if (typeof items !== 'object' || Array.isArray(items)) {
        items = { line_items: [], custom_fields: [] };
      }

      // Merge custom fields
      let cfs = items.custom_fields || [];
      for (const [label, value] of Object.entries(csvData.custom_fields)) {
        const existing = cfs.find(c => c.label === label);
        if (existing) {
          existing.value = value;
        } else {
          cfs.push({ label, value });
        }
      }
      items.custom_fields = cfs;

      // Merge line items
      let existingLines = items.line_items || [];
      let newLines = csvData.line_items.map(csvLine => {
        const matched = existingLines.find(e => (e.sku === csvLine.sku && csvLine.sku !== '') || e.name === csvLine.name);
        if (matched) {
          return { ...matched, ...csvLine };
        }
        return csvLine;
      });
      items.line_items = newLines;

      await prisma.invoice.update({
        where: { zohoId },
        data: { items }
      });

      updatedCount++;
      if (updatedCount % 500 === 0) {
        console.log(`Updated ${updatedCount} invoices...`);
      }
    } catch (err) {
      console.error(`Error updating invoice ${zohoId}:`, err.message);
    }
  }

  console.log(`\nBackfill complete! Updated: ${updatedCount} | Skipped (not found in DB): ${skippedCount}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
