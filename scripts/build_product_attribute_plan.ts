import fs from "node:fs"
import path from "node:path"
import { parseProductCsv, buildZohoDescription } from "../src/lib/product-csv-import"

const source = process.argv[2] || "Sopify data/sproductinfo.csv"
const output = process.argv[3] || "outputs/product-attribute-sync/import-plan.json"
const products = parseProductCsv(fs.readFileSync(source, "utf8")).map(product => ({
  ...product,
  zohoDescription: buildZohoDescription(product),
}))
const lengths = (key: "equipment" | "application" | "size") => products.map(product => product[key].length)
const summary = {
  generatedAt: new Date().toISOString(),
  source,
  products: products.length,
  withEquipment: products.filter(product => product.equipment).length,
  withApplication: products.filter(product => product.application).length,
  withSize: products.filter(product => product.size).length,
  withMaterials: products.filter(product => product.materials.length).length,
  maxLengths: {
    equipment: Math.max(...lengths("equipment")),
    application: Math.max(...lengths("application")),
    size: Math.max(...lengths("size")),
  },
}
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify({ summary, products }, null, 2))
console.log(JSON.stringify(summary, null, 2))
