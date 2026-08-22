import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const formattedDir = path.resolve("All Pics/formatted");
const zohoFormattedDir = path.resolve("All Pics/zoho-current-formatted");
const clean = (value) => value.trim().toUpperCase().replace(/^TDU-/, "").replace(/\s*\([\w\s,\.\/]+\)\s*\d*$/i, "").trim();
const localFiles = fs.readdirSync(formattedDir).filter((f) => /\.jpg$/i.test(f));
const zohoFiles = fs.readdirSync(zohoFormattedDir).filter((f) => /\.jpg$/i.test(f));
const candidates = localFiles.map((file) => ({ file, dir: formattedDir, key: clean(path.parse(file).name), source: "local", score: /\(/.test(file) ? 1 : 2 }));
const exactZoho = new Map(zohoFiles.map((file) => [path.parse(file).name.trim().toUpperCase(), { file, dir: zohoFormattedDir, source: "zoho-current" }]));
const overrides = new Map([
  ["TDU-SKP68GM", "Skid Plates .jpg"], ["TDU-SKP10GM", "Skid Plates .jpg"],
  ["TDU-SKP12GM", "Skid Plates .jpg"], ["TDU-SKP14GM", "Skid Plates .jpg"],
  ["TDU-ASHT04A2SET", "ASHT-SET.jpg"],
]);

function choose(productSku) {
  const raw = productSku.trim().toUpperCase();
  if (exactZoho.has(raw)) return { ...exactZoho.get(raw), reason: "exact-current-zoho", ambiguity: [] };
  if (overrides.has(raw)) {
    const file = overrides.get(raw);
    return { file, dir: formattedDir, source: "local", reason: "manual-override", ambiguity: [] };
  }
  const sku = clean(raw);
  const matches = candidates.filter((c) => sku === c.key || sku.startsWith(c.key) || c.key.startsWith(sku));
  if (!matches.length) return null;
  matches.sort((a, b) => (b.key === sku) - (a.key === sku) || b.key.length - a.key.length || b.score - a.score || a.file.localeCompare(b.file));
  const best = matches[0];
  const ambiguity = matches.filter((m) => m !== best && m.key.length === best.key.length && m.score === best.score).map((m) => m.file);
  return { ...best, reason: best.key === sku ? "exact-base" : "longest-prefix", ambiguity };
}

try {
  const products = await prisma.product.findMany({ select: { sku: true, name: true, description: true } });
  const planned = [];
  for (const product of products) {
    const selected = choose(product.sku);
    if (!selected) continue;
    let itemId = null;
    let currentImage = null;
    try {
      const desc = JSON.parse(product.description || "{}");
      itemId = desc.itemId || null;
      currentImage = desc.image || null;
    } catch {}
    planned.push({ sku: product.sku, name: product.name, itemId, currentImage, ...selected });
  }
  const summary = {
    products: products.length,
    publishMatches: planned.length,
    exactCurrentZoho: planned.filter((p) => p.reason === "exact-current-zoho").length,
    manualOverrides: planned.filter((p) => p.reason === "manual-override").length,
    withItemId: planned.filter((p) => p.itemId).length,
    withoutItemId: planned.filter((p) => !p.itemId).length,
    alreadySystemMapped: planned.filter((p) => p.currentImage).length,
    ambiguities: planned.filter((p) => p.ambiguity.length).length,
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ambiguous: planned.filter((p) => p.ambiguity.length).slice(0, 50), missingItemIds: planned.filter((p) => !p.itemId).slice(0, 50) }, null, 2));
} finally {
  await prisma.$disconnect();
}
