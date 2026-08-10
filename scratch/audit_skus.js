const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const total = await p.product.count();
  console.log('Total products in DB:', total);

  const tduProducts = await p.product.findMany({
    where: { sku: { startsWith: 'TDU-' } },
    select: { id: true, sku: true, name: true }
  });
  console.log('TDU- prefixed products:', tduProducts.length);
  tduProducts.slice(0, 20).forEach(x => console.log('  ', x.sku, '|', x.name));
  if (tduProducts.length > 20) console.log('  ... and', tduProducts.length - 20, 'more');

  // Check lowercase tdu too
  const tduLower = await p.product.findMany({
    where: { sku: { startsWith: 'tdu' } },
    select: { id: true, sku: true, name: true }
  });
  console.log('tdu (lowercase) products:', tduLower.length);
  tduLower.forEach(x => console.log('  ', x.sku, '|', x.name));

  // Count products with numeric-only SKU (Zoho IDs used as SKUs)
  const allProducts = await p.product.findMany({ select: { sku: true } });
  const numericSkus = allProducts.filter(p => /^\d{10,}$/.test(p.sku));
  console.log('Products with long-numeric SKU (Zoho IDs):', numericSkus.length);
  numericSkus.forEach(x => console.log('  ', x.sku));

  await p.$disconnect();
}
main();
