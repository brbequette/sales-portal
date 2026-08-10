/**
 * Fix All Product Images + Fetch Inactive Zoho Items
 * ---------------------------------------------------
 * 1. Re-fetch ALL Zoho items including inactive (status=all)
 * 2. Sync any missing inactive items to DB
 * 3. Re-match ALL products to actual image files in public/product-images/
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
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
  if (!data.access_token) throw new Error('Failed to get Zoho token: ' + JSON.stringify(data));
  return data.access_token;
}

async function fetchAllZohoItems(token, status = 'all') {
  const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/items`;
  let items = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${baseUrl}?organization_id=${ZOHO_ORG_ID}&page=${page}&per_page=200&filter_by=Status.All`;
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
      await new Promise(r => setTimeout(r, 300));
    } else {
      hasMore = false;
    }
  }
  return items;
}

function cleanStem(stem) {
  return stem.replace(/\s*\([\w\s,\.\/]+\)\s*\d*$/, '').trim().toUpperCase();
}

async function main() {
  console.log('=== Image Fix + Inactive Zoho Sync ===\n');

  // Step 1: Fetch ALL Zoho items including inactive
  console.log('Step 1: Fetching ALL Zoho items (active + inactive)...');
  const token = await getAccessToken();
  const zohoItems = await fetchAllZohoItems(token, 'all');
  console.log(`  Total Zoho items (all statuses): ${zohoItems.length}`);
  
  const activeCount = zohoItems.filter(i => i.status !== 'inactive').length;
  const inactiveCount = zohoItems.filter(i => i.status === 'inactive').length;
  console.log(`  Active: ${activeCount}, Inactive: ${inactiveCount}\n`);

  // Step 2: Sync any missing items (especially inactive ones)
  console.log('Step 2: Syncing missing items to DB...');
  const dbProducts = await prisma.product.findMany();
  const localMap = new Map(dbProducts.map(p => [p.sku.toUpperCase(), p]));

  const createOps = [];
  const updateOps = [];
  let skipCount = 0;

  for (const item of zohoItems) {
    const sku = (item.sku || '').trim();
    if (!sku) continue;
    const skuUpper = sku.toUpperCase();
    const name = item.name || '';
    const price = item.rate || 0;
    const stock = item.stock_on_hand || 0;
    const manufacturer = item.manufacturer || '';
    const vendor = item.brand || '';
    const zohoStatus = item.status === 'inactive' ? 'inactive' : 'active';

    const existing = localMap.get(skuUpper);
    if (existing) {
      let descObj = {};
      try { descObj = JSON.parse(existing.description || '{}'); } catch { descObj = {}; }
      descObj.itemId = item.item_id;
      descObj.status = zohoStatus;
      if (item.description) descObj.text = item.description;
      
      const newDesc = JSON.stringify(descObj);
      const hasDiff = existing.name !== name || Math.abs(existing.price - price) > 0.01 ||
        existing.stock !== stock || existing.manufacturer !== manufacturer || existing.vendor !== vendor;
      
      if (hasDiff) {
        updateOps.push(prisma.product.update({
          where: { id: existing.id },
          data: { name, price, stock, manufacturer, vendor, description: newDesc }
        }));
      } else {
        skipCount++;
      }
    } else {
      createOps.push({
        sku, name, price, stock, manufacturer, vendor,
        description: JSON.stringify({ itemId: item.item_id, status: zohoStatus, text: item.description || '' }),
        category: 'General'
      });
    }
  }

  // Execute updates
  for (let i = 0; i < updateOps.length; i += 100) {
    const chunk = updateOps.slice(i, i + 100);
    await prisma.$transaction(chunk);
  }
  console.log(`  Updated: ${updateOps.length}`);

  // Execute creates  
  if (createOps.length > 0) {
    const res = await prisma.product.createMany({ data: createOps, skipDuplicates: true });
    console.log(`  Created: ${res.count} (newly synced inactive items)`);
  } else {
    console.log('  Created: 0 (all items already exist)');
  }
  console.log(`  Unchanged: ${skipCount}`);

  // Step 3: Re-match ALL products to actual image files
  console.log('\nStep 3: Re-matching products to actual image files...');
  
  const imgDir = path.join(process.cwd(), 'public', 'product-images');
  const allPicsDir = 'C:\\Users\\titan\\Documents\\Titan Diamond\\All Pics';
  const processedDir = path.join(allPicsDir, 'processed');
  
  // Build image file index from public/product-images
  const imageFiles = fs.existsSync(imgDir) ? fs.readdirSync(imgDir).filter(f => f.endsWith('.png') && !f.includes('_detail_')) : [];
  const imageIndex = new Map();
  for (const f of imageFiles) {
    const stem = path.basename(f, '.png');
    const cleaned = cleanStem(stem);
    imageIndex.set(cleaned, stem);
  }
  console.log(`  Image files indexed: ${imageIndex.size}`);

  // Also index raw files from All Pics
  if (fs.existsSync(allPicsDir)) {
    const rawFiles = fs.readdirSync(allPicsDir).filter(f => {
      const full = path.join(allPicsDir, f);
      return !fs.statSync(full).isDirectory() && /\.(jpg|jpeg|png)$/i.test(f);
    });
    for (const f of rawFiles) {
      const ext = path.extname(f);
      const stem = path.basename(f, ext);
      const cleaned = cleanStem(stem);
      if (!imageIndex.has(cleaned)) {
        imageIndex.set(cleaned, stem);
      }
    }
    console.log(`  Total indexed (incl raw): ${imageIndex.size}`);
  }

  // Re-fetch all products and match
  const allProducts = await prisma.product.findMany();
  let matched = 0;
  let unmatched = 0;
  const imageUpdateOps = [];

  for (const prod of allProducts) {
    const skuUpper = prod.sku.toUpperCase();
    
    let descObj = {};
    try { descObj = JSON.parse(prod.description || '{}'); } catch { descObj = {}; }

    // Try matching SKU to image
    let matchedStem = null;
    
    // Strategy 1: Exact SKU match
    if (imageIndex.has(skuUpper)) {
      matchedStem = imageIndex.get(skuUpper);
    }
    
    // Strategy 2: SKU prefix match (longest match wins)
    if (!matchedStem) {
      let bestLen = 0;
      for (const [cleaned, stem] of imageIndex.entries()) {
        if (skuUpper.startsWith(cleaned) && cleaned.length >= 4 && cleaned.length > bestLen) {
          bestLen = cleaned.length;
          matchedStem = stem;
        }
      }
    }
    
    // Strategy 3: Image stem starts with SKU
    if (!matchedStem) {
      for (const [cleaned, stem] of imageIndex.entries()) {
        if (cleaned.startsWith(skuUpper) && skuUpper.length >= 4) {
          matchedStem = stem;
          break;
        }
      }
    }

    if (matchedStem) {
      // Check which files actually exist
      const mainImg = fs.existsSync(path.join(imgDir, `${matchedStem}.png`)) 
        ? `/product-images/${matchedStem}.png` 
        : null;
      
      const detailA = fs.existsSync(path.join(imgDir, `${matchedStem}_detail_a.png`))
        ? `/product-images/${matchedStem}_detail_a.png` : null;
      const detailB = fs.existsSync(path.join(imgDir, `${matchedStem}_detail_b.png`))
        ? `/product-images/${matchedStem}_detail_b.png` : null;
      const detailC = fs.existsSync(path.join(imgDir, `${matchedStem}_detail_c.png`))
        ? `/product-images/${matchedStem}_detail_c.png` : null;
      const detailD = fs.existsSync(path.join(imgDir, `${matchedStem}_detail_d.png`))
        ? `/product-images/${matchedStem}_detail_d.png` : null;
      
      // Also check processed dir and All Pics for raw
      let rawPath = null;
      if (!mainImg) {
        // Check if raw exists in All Pics
        for (const ext of ['.png', '.jpg', '.jpeg']) {
          if (fs.existsSync(path.join(allPicsDir, `${matchedStem}${ext}`))) {
            rawPath = `${matchedStem}${ext}`;
            break;
          }
        }
      }

      if (mainImg || rawPath) {
        descObj.image = mainImg || `/api/admin/images/serve?file=${encodeURIComponent(rawPath)}&type=raw`;
        if (detailA) descObj.detail_a = detailA;
        if (detailB) descObj.detail_b = detailB;
        if (detailC) descObj.detail_c = detailC;
        if (detailD) descObj.detail_d = detailD;
        descObj.imageStem = matchedStem;
        
        imageUpdateOps.push(prisma.product.update({
          where: { id: prod.id },
          data: { description: JSON.stringify(descObj) }
        }));
        matched++;
      } else {
        // Remove stale placeholder
        if (descObj.image === '/images/placeholder.png') {
          delete descObj.image;
          imageUpdateOps.push(prisma.product.update({
            where: { id: prod.id },
            data: { description: JSON.stringify(descObj) }
          }));
        }
        unmatched++;
      }
    } else {
      // No match - clear placeholder if present
      if (descObj.image === '/images/placeholder.png') {
        delete descObj.image;
        imageUpdateOps.push(prisma.product.update({
          where: { id: prod.id },
          data: { description: JSON.stringify(descObj) }
        }));
      }
      unmatched++;
    }
  }

  // Execute image updates in batches
  console.log(`  Matched to images: ${matched}`);
  console.log(`  No image match: ${unmatched}`);
  
  for (let i = 0; i < imageUpdateOps.length; i += 100) {
    const chunk = imageUpdateOps.slice(i, i + 100);
    await prisma.$transaction(chunk);
    console.log(`  Updated batch ${Math.floor(i / 100) + 1}: ${chunk.length} products`);
  }

  const finalCount = await prisma.product.count();
  console.log(`\n=== COMPLETE ===`);
  console.log(`  Final product count: ${finalCount}`);
  console.log(`  Products with real images: ${matched}`);
  console.log(`  Products without images: ${unmatched}`);

  await prisma.$disconnect();
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
