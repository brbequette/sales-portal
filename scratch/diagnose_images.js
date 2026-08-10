const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Check how many products have image data in description
  const all = await p.product.findMany({ select: { sku: true, description: true } });
  
  let withImage = 0;
  let withoutImage = 0;
  let sampleWithImage = [];
  let sampleLostImage = [];
  
  for (const prod of all) {
    try {
      const desc = JSON.parse(prod.description || '{}');
      if (desc.image) {
        withImage++;
        if (sampleWithImage.length < 3) sampleWithImage.push({ sku: prod.sku, image: desc.image });
      } else {
        withoutImage++;
      }
    } catch {
      withoutImage++;
    }
  }
  
  console.log('Total products:', all.length);
  console.log('Products WITH image path in description:', withImage);
  console.log('Products WITHOUT image path:', withoutImage);
  console.log('Sample with images:', JSON.stringify(sampleWithImage, null, 2));
  
  // Check if public/product-images has files
  const fs = require('fs');
  const path = require('path');
  const imgDir = path.join(process.cwd(), 'public', 'product-images');
  if (fs.existsSync(imgDir)) {
    const files = fs.readdirSync(imgDir).filter(f => !f.startsWith('.'));
    console.log('\npublic/product-images file count:', files.length);
    console.log('Sample files:', files.slice(0, 5));
  } else {
    console.log('\npublic/product-images directory does NOT exist!');
  }
  
  // Check All Pics directory
  const allPicsDir = 'C:\\Users\\titan\\Documents\\Titan Diamond\\All Pics';
  if (fs.existsSync(allPicsDir)) {
    const rawFiles = fs.readdirSync(allPicsDir).filter(f => !fs.statSync(path.join(allPicsDir, f)).isDirectory());
    console.log('\nAll Pics raw file count:', rawFiles.length);
    console.log('Sample raw files:', rawFiles.slice(0, 5));
  }
  
  await p.$disconnect();
}
main();
