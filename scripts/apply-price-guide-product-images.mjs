import fs from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const CONFIRM = process.argv.includes("--confirm=ATTACH-PRICE-GUIDE-IMAGES");
const planArg = process.argv.find((arg) => arg.startsWith("--plan="));
const planPath = planArg ? planArg.slice("--plan=".length) : "outputs/price-guide-db-images/update-plan.json";
const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const prisma = new PrismaClient();

try {
  const ids = plan.productUpdates.map((row) => row.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, sku: true, imageUrl: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  const stale = plan.productUpdates.filter((row) => {
    const product = byId.get(row.productId);
    return !product || product.sku !== row.sku || product.imageUrl !== row.oldImageUrl;
  });
  if (stale.length) throw new Error(`Refusing update: ${stale.length} products changed since the audit.`);

  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    planned: plan.productUpdates.length,
    currentRowsVerified: products.length,
    uniqueImages: new Set(plan.productUpdates.map((row) => row.newImageUrl)).size,
  }, null, 2));
  if (!APPLY) process.exit(0);
  if (!CONFIRM) throw new Error("Apply requires --confirm=ATTACH-PRICE-GUIDE-IMAGES");

  for (let index = 0; index < plan.productUpdates.length; index += 50) {
    const batch = plan.productUpdates.slice(index, index + 50);
    await prisma.$transaction(batch.map((row) => prisma.product.update({
      where: { id: row.productId },
      data: { imageUrl: row.newImageUrl },
    })));
    console.log(`Updated ${Math.min(index + batch.length, plan.productUpdates.length)}/${plan.productUpdates.length}`);
  }

  const verified = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, sku: true, imageUrl: true },
  });
  const expected = new Map(plan.productUpdates.map((row) => [row.productId, row.newImageUrl]));
  const mismatches = verified.filter((row) => row.imageUrl !== expected.get(row.id));
  if (mismatches.length) throw new Error(`Post-update verification failed for ${mismatches.length} products.`);
  console.log(JSON.stringify({ applied: plan.productUpdates.length, verified: verified.length, mismatches: 0 }));
} finally {
  await prisma.$disconnect();
}
