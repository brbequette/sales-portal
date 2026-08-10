/**
 * Zoho Books Product Sync & Cleanup Script
 * -----------------------------------------
 * 1. Fetches ALL items from Zoho Books (source of truth)
 * 2. Deletes local DB products NOT found in Zoho (TDU-, numeric IDs, etc.)
 * 3. Syncs Zoho data to local DB (upsert by SKU)
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Zoho config - read from .env
require('dotenv').config();

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
const ZOHO_ORG_ID = process.env.ZOHO_ORGANIZATION_ID;
const ZOHO_DC = process.env.ZOHO_DC || 'com';

async function getAccessToken() {
  const params = new URLSearchParams({
    refresh_token: ZOHO_REFRESH_TOKEN,
    client_id: ZOHO_CLIENT_ID,
    client_secret: ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token'
  });
  const res = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
    method: 'POST',
    body: params
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get Zoho access token: ' + JSON.stringify(data));
  return data.access_token;
}

async function fetchAllZohoItems(token) {
  const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/items`;
  let items = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${baseUrl}?organization_id=${ZOHO_ORG_ID}&page=${page}&per_page=200`;
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    
    if (res.status === 429) {
      console.log('  Rate limited, waiting 2s...');
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      items.push(...data.items);
      console.log(`  Fetched page ${page}: ${data.items.length} items (total: ${items.length})`);
      hasMore = data.page_context?.has_more_page || false;
      page++;
      // Rate limit courtesy
      await new Promise(r => setTimeout(r, 300));
    } else {
      hasMore = false;
    }
  }

  return items;
}

async function main() {
  console.log('=== Zoho Books Product Sync & Cleanup ===\n');

  // Step 1: Fetch all Zoho items
  console.log('Step 1: Fetching all items from Zoho Books...');
  const token = await getAccessToken();
  const zohoItems = await fetchAllZohoItems(token);
  console.log(`  Total Zoho items: ${zohoItems.length}\n`);

  if (zohoItems.length === 0) {
    console.error('ERROR: No items returned from Zoho. Aborting to prevent data loss.');
    process.exit(1);
  }

  // Build a set of valid SKUs from Zoho
  const zohoSkuSet = new Set();
  const zohoSkuMap = new Map();
  for (const item of zohoItems) {
    const sku = (item.sku || '').trim();
    if (sku) {
      zohoSkuSet.add(sku.toUpperCase());
      zohoSkuMap.set(sku.toUpperCase(), item);
    }
  }
  console.log(`  Unique Zoho SKUs: ${zohoSkuSet.size}\n`);

  // Step 2: Identify & delete local products NOT in Zoho
  console.log('Step 2: Identifying local products not in Zoho...');
  const allLocalProducts = await prisma.product.findMany({ select: { id: true, sku: true, name: true } });
  console.log(`  Total local products: ${allLocalProducts.length}`);

  const toDelete = [];
  const toKeep = [];
  for (const p of allLocalProducts) {
    const skuUpper = p.sku.toUpperCase();
    if (zohoSkuSet.has(skuUpper)) {
      toKeep.push(p);
    } else {
      toDelete.push(p);
    }
  }

  console.log(`  Products to KEEP (in Zoho): ${toKeep.length}`);
  console.log(`  Products to DELETE (not in Zoho): ${toDelete.length}`);

  // Categorize deletions
  const tduCount = toDelete.filter(p => p.sku.toUpperCase().startsWith('TDU-') || p.sku.toLowerCase().startsWith('tdu')).length;
  const numericCount = toDelete.filter(p => /^\d{10,}$/.test(p.sku)).length;
  const otherCount = toDelete.length - tduCount - numericCount;
  console.log(`    TDU- prefixed: ${tduCount}`);
  console.log(`    Numeric (Zoho IDs): ${numericCount}`);
  console.log(`    Other: ${otherCount}`);

  // Show some "other" deletions for reference
  const otherDeletions = toDelete.filter(p => !p.sku.toUpperCase().startsWith('TDU') && !/^\d{10,}$/.test(p.sku));
  if (otherDeletions.length > 0) {
    console.log('    Other deletions sample:');
    otherDeletions.slice(0, 15).forEach(p => console.log(`      ${p.sku} | ${p.name}`));
    if (otherDeletions.length > 15) console.log(`      ... and ${otherDeletions.length - 15} more`);
  }

  // Execute deletions in batches
  if (toDelete.length > 0) {
    console.log(`\n  Deleting ${toDelete.length} products...`);
    const deleteIds = toDelete.map(p => p.id);
    for (let i = 0; i < deleteIds.length; i += 500) {
      const batch = deleteIds.slice(i, i + 500);
      await prisma.product.deleteMany({ where: { id: { in: batch } } });
      console.log(`    Deleted batch ${Math.floor(i / 500) + 1}: ${batch.length} products`);
    }
  }

  // Step 3: Sync all remaining products with Zoho data
  console.log('\nStep 3: Syncing product data from Zoho Books...');
  let updatedCount = 0;
  let createdCount = 0;
  let skippedCount = 0;

  const updateOps = [];
  const createOps = [];

  // Get fresh local products after deletion
  const remainingProducts = await prisma.product.findMany();
  const localMap = new Map(remainingProducts.map(p => [p.sku.toUpperCase(), p]));

  for (const item of zohoItems) {
    const sku = (item.sku || '').trim();
    if (!sku) continue;
    const skuUpper = sku.toUpperCase();

    const name = item.name || '';
    const price = item.rate || 0;
    const stock = item.stock_on_hand || 0;
    const manufacturer = item.manufacturer || '';
    const vendor = item.brand || '';
    const isInactive = item.status === 'inactive';
    const zohoStatus = isInactive ? 'inactive' : 'active';

    const existing = localMap.get(skuUpper);

    if (existing) {
      let descObj = {};
      try {
        descObj = JSON.parse(existing.description || '{}');
      } catch {
        descObj = { text: existing.description || '' };
      }

      // Merge Zoho data (preserve local-only fields like image paths)
      descObj.itemId = item.item_id;
      descObj.status = zohoStatus;
      if (item.description) descObj.text = item.description;

      const newDesc = JSON.stringify(descObj);
      const hasDiff =
        existing.name !== name ||
        Math.abs(existing.price - price) > 0.01 ||
        existing.stock !== stock ||
        existing.manufacturer !== manufacturer ||
        existing.vendor !== vendor ||
        existing.description !== newDesc;

      if (hasDiff) {
        updateOps.push(
          prisma.product.update({
            where: { id: existing.id },
            data: { name, price, stock, manufacturer, vendor, description: newDesc }
          })
        );
      } else {
        skippedCount++;
      }
    } else {
      createOps.push({
        sku,
        name,
        price,
        stock,
        manufacturer,
        vendor,
        description: JSON.stringify({ itemId: item.item_id, status: zohoStatus, text: item.description || '' }),
        category: 'General'
      });
    }
  }

  // Execute updates in batches
  for (let i = 0; i < updateOps.length; i += 100) {
    const chunk = updateOps.slice(i, i + 100);
    await prisma.$transaction(chunk);
    updatedCount += chunk.length;
  }

  // Execute creates
  if (createOps.length > 0) {
    const res = await prisma.product.createMany({ data: createOps, skipDuplicates: true });
    createdCount = res.count;
  }

  // Final count
  const finalCount = await prisma.product.count();

  console.log('\n=== SYNC COMPLETE ===');
  console.log(`  Zoho items fetched: ${zohoItems.length}`);
  console.log(`  Deleted (not in Zoho): ${toDelete.length}`);
  console.log(`  Updated (Zoho data): ${updatedCount}`);
  console.log(`  Created (new from Zoho): ${createdCount}`);
  console.log(`  Unchanged: ${skippedCount}`);
  console.log(`  Final DB product count: ${finalCount}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
