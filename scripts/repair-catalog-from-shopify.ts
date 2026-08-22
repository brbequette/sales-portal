import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { parseProductCsv, type CatalogImportProduct } from '../src/lib/product-csv-import';

const prisma = new PrismaClient();
async function main() {
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const paths = args.filter((arg) => arg !== '--apply');
if (!paths.length) throw new Error('Provide one or more Shopify CSV paths. Add --apply after reviewing the preview.');

const empty = (value: unknown) => value == null || value === '' || (Array.isArray(value) && value.length === 0) || (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0);
const normalizedSku = (sku: string) => sku.trim().toUpperCase().replace(/^TDU-/, '');
const merged = new Map<string, CatalogImportProduct>();
for (const csvPath of paths) {
  for (const incoming of parseProductCsv(fs.readFileSync(csvPath, 'utf8'))) {
    const current = merged.get(incoming.sku);
    if (!current) { merged.set(incoming.sku, incoming); continue; }
    merged.set(incoming.sku, {
      ...current,
      ...Object.fromEntries(Object.entries(incoming).filter(([, value]) => !empty(value))),
      materials: [...new Set([...current.materials, ...incoming.materials])],
      attributes: { ...current.attributes, ...incoming.attributes },
    });
  }
}

const products = [...merged.values()];
const existing = new Map<string, Awaited<ReturnType<typeof loadExisting>>[number]>();
for (let offset = 0; offset < products.length; offset += 500) {
  const batch = products.slice(offset, offset + 500);
  const candidates = [...new Set(batch.flatMap((item) => [item.sku, normalizedSku(item.sku)]))];
  for (const product of await loadExisting(candidates)) existing.set(normalizedSku(product.sku), product);
}

let matched = 0;
let unmatched = 0;
let updates = 0;
const fieldCounts: Record<string, number> = {};
const operations: Array<{ id: string; data: Record<string, unknown> }> = [];
for (const incoming of products) {
  const current = existing.get(normalizedSku(incoming.sku));
  if (!current) { unmatched++; continue; }
  matched++;
  const data: Record<string, unknown> = {};
  const candidates: Record<string, unknown> = {
    size: incoming.size, application: incoming.application, manufacturer: incoming.manufacturer,
    vendor: incoming.vendor, productType: incoming.productType, toolType: incoming.toolType,
    equipment: incoming.equipment, imageUrl: incoming.imageUrl, barcode: incoming.barcode,
    weightGrams: incoming.weightGrams,
  };
  for (const [field, value] of Object.entries(candidates)) {
    if (empty(current[field as keyof typeof current]) && !empty(value)) { data[field] = value; fieldCounts[field] = (fieldCounts[field] || 0) + 1; }
  }
  const currentMaterials = Array.isArray(current.materials) ? current.materials.map(String) : [];
  const materials = [...new Set([...currentMaterials, ...incoming.materials])];
  if (materials.length > currentMaterials.length) { data.materials = materials; fieldCounts.materials = (fieldCounts.materials || 0) + 1; }
  const currentAttributes = current.attributes && typeof current.attributes === 'object' && !Array.isArray(current.attributes) ? current.attributes as Record<string, unknown> : {};
  const attributes = { ...incoming.attributes, ...currentAttributes };
  if (JSON.stringify(attributes) !== JSON.stringify(currentAttributes)) { data.attributes = attributes; fieldCounts.attributes = (fieldCounts.attributes || 0) + 1; }
  if (Object.keys(data).length) { updates++; operations.push({ id: current.id, data }); }
}

console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', csvProducts: products.length, matched, unmatched, updates, fieldCounts }, null, 2));
if (apply) {
  for (let offset = 0; offset < operations.length; offset += 100) {
    await prisma.$transaction(operations.slice(offset, offset + 100).map((operation) => prisma.product.update({ where: { id: operation.id }, data: operation.data })));
  }
  console.log(`Applied ${operations.length} fill-only catalog updates.`);
}

async function loadExisting(skus: string[]) {
  return prisma.product.findMany({
    where: { sku: { in: skus, mode: 'insensitive' } },
    select: { id: true, sku: true, size: true, application: true, manufacturer: true, vendor: true, productType: true, toolType: true, equipment: true, materials: true, attributes: true, imageUrl: true, barcode: true, weightGrams: true },
  });
}
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
