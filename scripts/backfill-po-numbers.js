const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const csv = require('csv-parse/sync');

const prisma = new PrismaClient();

async function main() {
  console.log('1. Adding poNumber column if not exists...');
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "poNumber" TEXT;`);
  console.log('Column added or already exists.');

  console.log('2. Loading CSV mappings...');
  const csvPath = 'c:\\Users\\titan\\Documents\\Titan Diamond\\AUTOMATIONS\\exports\\Purchase_Order (9).csv';
  const csvMap = new Map();
  if (fs.existsSync(csvPath)) {
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = csv.parse(fileContent, { columns: true, skip_empty_lines: true });
    for (const r of records) {
      const id = r['Purchase Order ID'];
      const poNum = r['Purchase Order Number'];
      if (id && poNum) {
        csvMap.set(id, poNum.trim());
      }
    }
    console.log(`Loaded ${csvMap.size} PO number mappings from CSV.`);
  }

  console.log('3. Fetching all Purchase Orders from DB...');
  const pos = await prisma.purchaseOrder.findMany({
    select: { id: true, zohoId: true, items: true, referenceNumber: true }
  });

  console.log(`Processing ${pos.length} POs for backfill...`);
  const updates = [];

  for (const po of pos) {
    let poNumber = csvMap.get(po.zohoId);
    if (!poNumber && po.items && typeof po.items === 'object') {
      poNumber = po.items.purchaseorder_number || po.items.po_number;
    }
    if (poNumber) {
      updates.push({ id: po.id, poNumber: String(poNumber) });
    }
  }

  console.log(`Found ${updates.length} POs with valid poNumber.`);

  const batchSize = 1000;
  let updatedCount = 0;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const values = batch.map(u => `('${u.id.replace(/'/g, "''")}', '${u.poNumber.replace(/'/g, "''")}')`).join(',');
    const sql = `UPDATE "PurchaseOrder" AS p SET "poNumber" = v.po_num FROM (VALUES ${values}) AS v(id, po_num) WHERE p.id = v.id;`;
    await prisma.$executeRawUnsafe(sql);
    updatedCount += batch.length;
    console.log(`Updated ${updatedCount}/${updates.length} records...`);
  }

  console.log('Backfill complete!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
