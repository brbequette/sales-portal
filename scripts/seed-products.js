const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const fileContent = fs.readFileSync('C:/Users/titan/Documents/Titan Diamond/deals/Items.csv', 'utf8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true
  });

  console.log(`Found ${records.length} products in CSV.`);

  let successCount = 0;
  let skipCount = 0;

  for (const record of records) {
    try {
      if (record['Status'] === 'Inactive') {
        skipCount++;
        continue;
      }

      const sku = record['SKU'];
      if (!sku) {
        skipCount++;
        continue;
      }

      const name = record['Item Name'] || sku;
      const description = record['Description'] || '';
      
      let priceStr = record['Rate'] || '0';
      priceStr = priceStr.replace('USD', '').trim();
      const price = parseFloat(priceStr) || 0;

      const stockStr = record['Stock On Hand'] || '0';
      const stock = parseInt(stockStr, 10) || 0;

      await prisma.product.upsert({
        where: { sku: sku },
        update: {
          name: name,
          description: description,
          price: price,
          stock: stock,
          category: record['Brand'] || 'General'
        },
        create: {
          sku: sku,
          name: name,
          description: description,
          price: price,
          stock: stock,
          category: record['Brand'] || 'General'
        }
      });
      successCount++;
    } catch (e) {
      console.error(`Error processing product ${record['SKU']}:`, e.message);
    }
  }

  console.log(`Finished. Upserted ${successCount} active products, skipped ${skipCount}.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
