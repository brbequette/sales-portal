import fs from "node:fs/promises";

const basePlan = JSON.parse(await fs.readFile("outputs/price-guide-db-images/update-plan.json", "utf8"));
const imageMap = JSON.parse(await fs.readFile("src/lib/image-map.json", "utf8"));
const promoted = basePlan.productUpdates.map((row) => {
  const match = row.newImageUrl.match(/price-guide-(image\d+)/i);
  if (!match) throw new Error(`Cannot derive source asset for ${row.sku}: ${row.newImageUrl}`);
  const newImageUrl = `/product-images/pioneer-price-guide/studio-v3/price-guide-${match[1].toLowerCase()}.jpg`;
  const entry = imageMap[row.sku.toUpperCase()] || {};
  imageMap[row.sku.toUpperCase()] = { ...entry, image: newImageUrl };
  return { ...row, oldImageUrl: row.newImageUrl, newImageUrl };
});
const output = { ...basePlan, version: "studio-v3-preservation-first", productUpdates: promoted };
await fs.writeFile("outputs/price-guide-db-images/update-plan-v3.json", JSON.stringify(output, null, 2), "utf8");
await fs.writeFile("src/lib/image-map.json", JSON.stringify(imageMap, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ products: promoted.length, uniqueImages: new Set(promoted.map((row) => row.newImageUrl)).size }, null, 2));
