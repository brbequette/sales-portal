import fs from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const candidates = JSON.parse(await fs.readFile(".codex-artifact/price-guide-inspect/sku-image-candidates.json", "utf8"));
const normalize = (sku) => String(sku || "").trim().toUpperCase().replace(/^TDU-/, "");
try {
  const products = await prisma.product.findMany({ select: { id: true, sku: true, name: true, imageUrl: true, description: true } });
  const bySku = new Map(products.map((p) => [normalize(p.sku), p]));
  const exact = candidates.filter((c) => c.matched && bySku.has(normalize(c.sku)));
  const unique = new Map();
  const conflicts = [];
  for (const row of exact) {
    const key = normalize(row.sku);
    const prev = unique.get(key);
    if (prev && prev.media !== row.media) conflicts.push({ sku: row.sku, first: prev.media, second: row.media, sheets: [prev.sheet, row.sheet] });
    else if (!prev) unique.set(key, row);
  }
  const matchedProducts = [...unique.entries()].map(([key, row]) => {
    const product = bySku.get(key);
    return { ...row, productId: product.id, databaseSku: product.sku, productName: product.name, existingImageUrl: product.imageUrl };
  });
  const report = {
    databaseProductCount: products.length,
    matchedRows: exact.length,
    uniqueMatchedProducts: matchedProducts.length,
    conflicts,
    alreadyHaveImageUrl: matchedProducts.filter((x) => x.existingImageUrl).length,
    missingImageUrl: matchedProducts.filter((x) => !x.existingImageUrl).length,
    matchedProducts,
  };
  await fs.writeFile(".codex-artifact/price-guide-inspect/db-match-audit.json", JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ ...report, matchedProducts: undefined }, null, 2));
} finally {
  await prisma.$disconnect();
}
