import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const sourceDir = path.resolve("All Pics/TITAN BLADES publish-ready");
const publicDir = path.resolve("public/product-images");
const mapPath = path.resolve("src/lib/image-map.json");
const reportDir = path.resolve("outputs/zoho-image-publish/2026-08-21T20-29-58-107Z");
const families = [
  { file: "barbarian.png", test: (n) => /^THE BARBARIAN(?:\s|$)/i.test(n) },
  { file: "battle axe.png", test: (n) => /^THE BATTLE AXE(?:\s|$)/i.test(n) },
  { file: "dark knight.png", test: (n) => /^THE DARK KNIGHT(?:\s|$)/i.test(n) },
  { file: "demo demon.png", test: (n) => /^THE DEMO DEMON(?:\s|$)/i.test(n) },
  { file: "dragon.png", test: (n) => /^THE DRAGON(?:\s|$)/i.test(n) },
  { file: "gladiator.png", test: (n) => /^THE GLADIATOR(?:\s|$)/i.test(n) },
  { file: "hounds of hades.png", test: (n) => /^THE HOUND(?:S)? OF HADES(?:\s|$)/i.test(n) },
  { file: "hydra.png", test: (n) => /^THE HYDRA(?:\s|$)/i.test(n) },
  { file: "king.png", test: (n) => /^THE KING(?:\s|$)/i.test(n) },
  { file: "maximus.png", test: (n) => /^THE MAXIMUS(?:\s|$)/i.test(n) },
  { file: "medusa.png", test: (n) => /^THE MEDUSA(?:\s|$)/i.test(n) },
  { file: "zeus.png", test: (n) => /^THE ZEUS(?:\s|$)/i.test(n) },
];

try {
  const products = await prisma.product.findMany({ select: { id: true, sku: true, name: true, description: true } });
  const selected = [];
  for (const product of products) {
    const family = families.find((f) => f.test(product.name));
    if (!family) continue;
    let parsed = {};
    try { parsed = JSON.parse(product.description || "{}"); } catch { parsed = { text: product.description || "" }; }
    if (!parsed.itemId) continue;
    const publicFile = `${path.parse(family.file).name}-formatted.png`;
    selected.push({ product, parsed, itemId: parsed.itemId, sourceFile: family.file, publicFile, publicPath: `/product-images/${publicFile}` });
  }
  const foundFamilies = new Set(selected.map((s) => s.sourceFile));
  const missingFamilies = families.filter((f) => !foundFamilies.has(f.file)).map((f) => f.file);
  if (missingFamilies.length) throw new Error(`No products found for: ${missingFamilies.join(", ")}`);
  await fs.writeFile(path.join(reportDir, "rollback-titan-themes.json"), JSON.stringify(selected.map((s) => ({ id: s.product.id, sku: s.product.sku, description: s.product.description })), null, 2));
  const imageMap = JSON.parse(await fs.readFile(mapPath, "utf8"));
  for (const family of families) await fs.copyFile(path.join(sourceDir, family.file), path.join(publicDir, `${path.parse(family.file).name}-formatted.png`));
  for (const entry of selected) {
    entry.parsed.image = entry.publicPath;
    entry.parsed.detail_a = null;
    entry.parsed.detail_b = null;
    entry.parsed.detail_c = null;
    entry.parsed.detail_d = null;
    await prisma.$executeRaw`UPDATE "Product" SET "description" = ${JSON.stringify(entry.parsed)}, "updatedAt" = NOW() WHERE "id" = ${entry.product.id}`;
    imageMap[entry.product.sku.trim().toUpperCase()] = { image: entry.publicPath, detail_a: null, detail_b: null, detail_c: null, detail_d: null };
  }
  await fs.writeFile(mapPath, JSON.stringify(imageMap, null, 2));
  const queue = selected.map((s) => ({ sku: s.product.sku, name: s.product.name, itemId: s.itemId, publicFile: s.publicFile, publicPath: s.publicPath, sourceFile: s.sourceFile }));
  await fs.writeFile(path.join(reportDir, "titan-theme-zoho-queue.json"), JSON.stringify(queue, null, 2));
  console.log(JSON.stringify({ systemUpdated: selected.length, uniqueThemeImages: families.length, pendingZohoUploads: queue.length, unmatchedFiles: ["ductile iron.png"] }, null, 2));
} finally {
  await prisma.$disconnect();
}
