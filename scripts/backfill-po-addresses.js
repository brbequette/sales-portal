const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const csv = require('csv-parse/sync');

const prisma = new PrismaClient();

async function main() {
  console.log('1. Adding shippingAddress column if not exists...');
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "shippingAddress" TEXT;`);
  console.log('Column added or already exists.');

  console.log('2. Loading CSV address mappings...');
  const csvPath = 'c:\\Users\\titan\\Documents\\Titan Diamond\\AUTOMATIONS\\exports\\Purchase_Order (9).csv';
  const csvMap = new Map();

  if (fs.existsSync(csvPath)) {
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = csv.parse(fileContent, { columns: true, skip_empty_lines: true });

    for (const r of records) {
      const id = r['Purchase Order ID'];
      const customer = (r['Deliver To Customer'] || r['Attention'] || '').trim();
      const street = (r['Recipient Address'] || r['Address'] || '').trim();
      const city = (r['Recipient City'] || '').trim();
      const state = (r['Recipient State'] || '').trim();
      const zip = (r['Recipient Postal Code'] || '').trim();

      const addrParts = [street, city, state, zip].filter(Boolean);
      const fullAddress = addrParts.join(', ');

      if (id && (customer || fullAddress)) {
        if (!csvMap.has(id)) {
          csvMap.set(id, { shipToName: customer || null, shippingAddress: fullAddress || null });
        }
      }
    }
    console.log(`Loaded ${csvMap.size} PO address mappings from CSV.`);
  }

  console.log('3. Fetching all Purchase Orders from DB...');
  const pos = await prisma.purchaseOrder.findMany({
    select: { id: true, zohoId: true, shipToName: true, items: true }
  });

  const updates = [];
  for (const po of pos) {
    let shipToName = po.shipToName;
    let shippingAddress = null;

    const csvData = csvMap.get(po.zohoId);
    if (csvData) {
      if (!shipToName && csvData.shipToName) shipToName = csvData.shipToName;
      if (csvData.shippingAddress) shippingAddress = csvData.shippingAddress;
    }

    if (po.items && typeof po.items === 'object') {
      const items = po.items;
      if (!shipToName) {
        shipToName = items.delivery_customer_name || items.customer_name || items.recipient_name || items.attention || null;
      }
      if (!shippingAddress) {
        shippingAddress = items.delivery_address || items.shipping_address || items.recipient_address || items.address || null;
      }
    }

    if (shipToName || shippingAddress) {
      updates.push({
        id: String(po.id),
        shipToName: shipToName ? String(shipToName) : null,
        shippingAddress: shippingAddress ? String(shippingAddress) : null
      });
    }
  }

  console.log(`Updating ${updates.length} POs with shipToName / shippingAddress...`);

  const batchSize = 1000;
  let updatedCount = 0;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const values = batch.map(u => {
      const sName = u.shipToName ? `'${u.shipToName.replace(/'/g, "''")}'` : 'NULL';
      const sAddr = u.shippingAddress ? `'${u.shippingAddress.replace(/'/g, "''")}'` : 'NULL';
      return `('${u.id.replace(/'/g, "''")}', ${sName}, ${sAddr})`;
    }).join(',');

    const sql = `UPDATE "PurchaseOrder" AS p SET "shipToName" = COALESCE(v.ship_to, p."shipToName"), "shippingAddress" = v.ship_addr FROM (VALUES ${values}) AS v(id, ship_to, ship_addr) WHERE p.id = v.id;`;
    await prisma.$executeRawUnsafe(sql);
    updatedCount += batch.length;
    console.log(`Updated ${updatedCount}/${updates.length} records...`);
  }

  console.log('Address backfill complete!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
