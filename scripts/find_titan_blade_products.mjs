import fs from "node:fs";
import path from "node:path";
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match) continue;
  const value = match[2].trim().replace(/^['"]|['"]$/g, "");
  process.env[match[1]] = value;
}
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
try {
  const names = fs.readdirSync("All Pics/TITAN BLADES").filter((f) => /\.png$/i.test(f)).map((f) => path.parse(f).name);
  const products = await prisma.product.findMany({ select: { sku: true, name: true, description: true } });
  const results = names.map((fileName) => {
    const words = fileName.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const matches = products.filter((p) => {
      const haystack = `${p.sku} ${p.name}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    }).map((p) => ({ sku: p.sku, name: p.name }));
    return { file: `${fileName}.png`, matches };
  });
  results.push({ file: "__ductile_candidates__", matches: products.filter((p) => /DUCTILE|IRON/i.test(`${p.sku} ${p.name}`)).map((p) => ({ sku: p.sku, name: p.name })) });
  results.push({ file: "__hound_candidates__", matches: products.filter((p) => /HOUND.*HADES/i.test(`${p.sku} ${p.name}`)).map((p) => ({ sku: p.sku, name: p.name })) });
  console.log(JSON.stringify(results, null, 2));
} finally {
  await prisma.$disconnect();
}
