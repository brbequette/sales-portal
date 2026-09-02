import fs from "node:fs/promises";

const root = "C:/Users/titan/Documents/ChatGPT/Titan Diamond";
await fs.mkdir(`${root}/outputs/product-data-comparison`, { recursive: true });
const values = JSON.parse(await fs.readFile(`${root}/.codex-artifact/product-data-inspect/PRICELIST_All-values.json`, "utf8"));
const manifest = JSON.parse(await fs.readFile(`${root}/.codex-artifact/product-data-inspect/image-manifest.json`, "utf8"));
const productLines = (await fs.readFile(`${root}/.codex-artifact/product-data-inspect/products.jsonl`, "utf8")).split(/\r?\n/).filter(Boolean);
const products = productLines.map((line) => JSON.parse(line.replaceAll("\\\\", "\\")));
const normalizeSku = (value) => String(value ?? "").trim().toUpperCase().replace(/^TDU-/, "");
const clean = (value) => value == null ? "" : String(value).trim();
const num = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
const safeValue = (value) => typeof value === "string" && /^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A)/i.test(value) ? null : value;
const productBySku = new Map(products.map((product) => [normalizeSku(product.sku), product]));
const imagesByRow = new Map();
for (const image of manifest.find((sheet) => sheet.sheet === "PRICELIST All")?.images || []) {
  if (!imagesByRow.has(image.row)) imagesByRow.set(image.row, []);
  imagesByRow.get(image.row).push(image);
}

const rows = [];
for (let row = 1; row < values.length; row++) {
  const v = values[row] || [];
  const workbookSku = clean(v[3]);
  if (!workbookSku) continue;
  const normalizedSku = normalizeSku(workbookSku);
  const product = productBySku.get(normalizedSku) || null;
  const rowImages = imagesByRow.get(row) || [];
  const workbook = {
    bladeFamily: clean(v[2]), sku: workbookSku, vendorPrice: num(v[4]), tariff: num(v[5]), tariffCost: num(v[6]), vigCost: num(v[7]), sellingPrice: num(v[8]),
    description: clean(v[9]), qualityClass: clean(v[10]), countryOfOrigin: clean(v[11]), dryWet: clean(v[13]), application: clean(v[14]), equipment: clean(v[15]), slotType: clean(v[16]),
    segmentHeightColor: clean(v[17]), inventory: clean(v[18]), additionalInfo: clean(v[19]), bladeType: clean(v[20]), dimensionDescription: clean(v[23]), diameter: safeValue(v[24]) ?? null, thickness: safeValue(v[25]) ?? null, arbor: safeValue(v[26]) ?? null,
  };
  let descriptionJson = {};
  if (product?.description) { try { descriptionJson = JSON.parse(product.description); } catch {} }
  const dbCost = typeof descriptionJson.cost === "number" ? descriptionJson.cost : null;
  const priceDifference = product && workbook.sellingPrice != null ? product.price - workbook.sellingPrice : null;
  const costDifference = product && dbCost != null && workbook.vendorPrice != null ? dbCost - workbook.vendorPrice : null;
  const comparisons = product ? {
    sellingPriceMatches: priceDifference != null ? Math.abs(priceDifference) < 0.005 : null,
    vendorCostMatches: costDifference != null ? Math.abs(costDifference) < 0.005 : null,
    qualityMatches: clean(product.qualityTier).toUpperCase() === workbook.qualityClass.toUpperCase(),
    applicationMatches: clean(product.application).toUpperCase() === workbook.application.toUpperCase(),
    equipmentMatches: clean(product.equipment).toUpperCase() === workbook.equipment.toUpperCase(),
  } : null;
  rows.push({
    sourceRow: row + 1, normalizedSku, workbook, images: rowImages.map((image) => image.media), imageCount: rowImages.length,
    database: product ? { id: product.id, sku: product.sku, name: product.name, price: product.price, cost: dbCost, category: product.category, qualityTier: product.qualityTier, application: product.application, equipment: product.equipment, materials: product.materials, imageUrl: product.imageUrl, attributes: product.attributes } : null,
    status: !product ? "SKU_NOT_IN_DATABASE" : rowImages.length === 0 ? "MATCHED_NO_WORKBOOK_IMAGE" : rowImages.length > 1 ? "MATCHED_MULTIPLE_IMAGES" : "MATCHED_WITH_IMAGE",
    comparisons, priceDifference, costDifference,
  });
}

const duplicateWorkbookSkus = [...rows.reduce((map, row) => map.set(row.normalizedSku, (map.get(row.normalizedSku) || 0) + 1), new Map())].filter(([, count]) => count > 1);
const summary = {
  workbookProductRows: rows.length,
  uniqueWorkbookSkus: new Set(rows.map((row) => row.normalizedSku)).size,
  duplicateWorkbookSkus: duplicateWorkbookSkus.length,
  databaseProducts: products.length,
  matchedDatabaseRows: rows.filter((row) => row.database).length,
  unmatchedWorkbookRows: rows.filter((row) => !row.database).length,
  matchedWithImage: rows.filter((row) => row.status === "MATCHED_WITH_IMAGE").length,
  matchedWithoutImage: rows.filter((row) => row.status === "MATCHED_NO_WORKBOOK_IMAGE").length,
  multipleImagesSameRow: rows.filter((row) => row.status === "MATCHED_MULTIPLE_IMAGES").length,
  rowsWithExistingDatabaseImage: rows.filter((row) => row.database?.imageUrl).length,
  sellingPriceMatches: rows.filter((row) => row.comparisons?.sellingPriceMatches === true).length,
  sellingPriceConflicts: rows.filter((row) => row.comparisons?.sellingPriceMatches === false).length,
  vendorCostMatches: rows.filter((row) => row.comparisons?.vendorCostMatches === true).length,
  vendorCostConflicts: rows.filter((row) => row.comparisons?.vendorCostMatches === false).length,
  uniqueWorkbookMedia: new Set(rows.flatMap((row) => row.images)).size,
};
await fs.writeFile(`${root}/outputs/product-data-comparison/comparison.json`, JSON.stringify({ summary, duplicateWorkbookSkus, rows }, null, 2), "utf8");
console.log(JSON.stringify(summary, null, 2));
