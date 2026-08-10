/**
 * Regenerate image-map.json
 * Maps every product SKU to its actual image files in public/product-images/
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const IMG_DIR = path.join(process.cwd(), 'public', 'product-images');

function cleanStem(stem) {
  // Remove parenthetical suffixes and trailing numbers for matching
  return stem.replace(/\s*\([\w\s,\.\/]+\)\s*\d*$/, '').trim().toUpperCase();
}

async function main() {
  console.log('=== Regenerating image-map.json ===\n');

  // 1. Index all main image files (exclude detail crops)
  const allFiles = fs.readdirSync(IMG_DIR).filter(f => f.endsWith('.png'));
  const mainFiles = allFiles.filter(f => !f.includes('_detail_'));
  console.log(`Main image files: ${mainFiles.length}`);
  
  // Build stem -> filename map
  const stemMap = new Map();  // cleaned stem -> original stem (without ext)
  for (const f of mainFiles) {
    const stem = path.basename(f, '.png');
    const cleaned = cleanStem(stem);
    stemMap.set(cleaned, stem);
  }

  // 2. Get all products from DB
  const products = await prisma.product.findMany({ select: { sku: true } });
  console.log(`Products in DB: ${products.length}`);

  // 3. Match each SKU to an image
  const imageMap = {};
  let matched = 0;
  let unmatched = 0;

  for (const prod of products) {
    const sku = prod.sku.trim();
    const skuUpper = sku.toUpperCase();
    let matchedStem = null;

    // Strategy 1: Exact match
    if (stemMap.has(skuUpper)) {
      matchedStem = stemMap.get(skuUpper);
    }

    // Strategy 2: SKU starts with image stem (image stem is a prefix of SKU)
    // e.g., SKU "DC5010H" matches image "DC5010"
    if (!matchedStem) {
      let bestLen = 0;
      for (const [cleaned, stem] of stemMap.entries()) {
        if (skuUpper.startsWith(cleaned) && cleaned.length >= 4 && cleaned.length > bestLen) {
          bestLen = cleaned.length;
          matchedStem = stem;
        }
      }
    }

    // Strategy 3: Image stem starts with SKU (SKU is a prefix of image stem)
    // e.g., SKU "ASFM" matches image "ASFM"
    if (!matchedStem) {
      for (const [cleaned, stem] of stemMap.entries()) {
        if (cleaned.startsWith(skuUpper) && skuUpper.length >= 4) {
          matchedStem = stem;
          break;
        }
      }
    }

    if (matchedStem) {
      const entry = {};
      
      // Check which files exist
      const mainPath = path.join(IMG_DIR, `${matchedStem}.png`);
      if (fs.existsSync(mainPath)) {
        entry.image = `/product-images/${matchedStem}.png`;
      }
      
      for (const suffix of ['detail_a', 'detail_b', 'detail_c', 'detail_d']) {
        const detailPath = path.join(IMG_DIR, `${matchedStem}_${suffix}.png`);
        if (fs.existsSync(detailPath)) {
          entry[suffix] = `/product-images/${matchedStem}_${suffix}.png`;
        }
      }

      if (entry.image) {
        imageMap[skuUpper] = entry;
        matched++;
      } else {
        unmatched++;
      }
    } else {
      unmatched++;
    }
  }

  console.log(`\nMatched: ${matched}`);
  console.log(`Unmatched: ${unmatched}`);
  console.log(`Total entries in map: ${Object.keys(imageMap).length}`);

  // 4. Write the map
  const outPath = path.join(process.cwd(), 'src', 'lib', 'image-map.json');
  fs.writeFileSync(outPath, JSON.stringify(imageMap, null, 2));
  console.log(`\nWritten to: ${outPath}`);
  console.log(`File size: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);

  // 5. Also update product descriptions with correct image paths
  console.log('\nUpdating product descriptions with image paths...');
  const allProducts = await prisma.product.findMany();
  const updateOps = [];

  for (const prod of allProducts) {
    const skuUpper = prod.sku.trim().toUpperCase();
    const imgEntry = imageMap[skuUpper];
    
    let descObj = {};
    try { descObj = JSON.parse(prod.description || '{}'); } catch { descObj = {}; }

    if (imgEntry && imgEntry.image) {
      const oldImage = descObj.image;
      descObj.image = imgEntry.image;
      if (imgEntry.detail_a) descObj.detail_a = imgEntry.detail_a;
      if (imgEntry.detail_b) descObj.detail_b = imgEntry.detail_b;
      if (imgEntry.detail_c) descObj.detail_c = imgEntry.detail_c;
      if (imgEntry.detail_d) descObj.detail_d = imgEntry.detail_d;
      
      if (oldImage !== imgEntry.image) {
        updateOps.push(prisma.product.update({
          where: { id: prod.id },
          data: { description: JSON.stringify(descObj) }
        }));
      }
    } else if (descObj.image === '/images/placeholder.png' || descObj.image === '/product-images/SMA.png') {
      // Clear bad paths
      delete descObj.image;
      delete descObj.detail_a;
      delete descObj.detail_b;
      updateOps.push(prisma.product.update({
        where: { id: prod.id },
        data: { description: JSON.stringify(descObj) }
      }));
    }
  }

  console.log(`  DB updates needed: ${updateOps.length}`);
  for (let i = 0; i < updateOps.length; i += 100) {
    const chunk = updateOps.slice(i, i + 100);
    await prisma.$transaction(chunk);
  }
  console.log('  Done!');

  await prisma.$disconnect();
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
