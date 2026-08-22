import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const localDir = path.resolve("All Pics/publish-ready");
const zohoDir = path.resolve("All Pics/publish-ready/zoho-current");
const publicDir = path.resolve("public/product-images");
const mapPath = path.resolve("src/lib/image-map.json");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const reportDir = path.resolve("outputs/zoho-image-publish", runId);
await fs.mkdir(reportDir, { recursive: true });
await fs.mkdir(publicDir, { recursive: true });

const clean = (value) => value.trim().toUpperCase().replace(/^TDU-/, "").replace(/\s*\([\w\s,\.\/]+\)\s*\d*$/i, "").trim();
const compact = (value) => value.replace(/[^A-Z0-9]/g, "");
const localFiles = (await fs.readdir(localDir)).filter((f) => /\.png$/i.test(f));
const zohoFiles = (await fs.readdir(zohoDir)).filter((f) => /\.png$/i.test(f));
const candidates = localFiles.map((file) => ({ file, dir: localDir, key: clean(path.parse(file).name), score: /\(/.test(file) ? 1 : 2 }));
const exactZoho = new Map();
for (const file of zohoFiles) {
  const stem = path.parse(file).name.trim().toUpperCase();
  exactZoho.set(stem, { file, dir: zohoDir });
  exactZoho.set(compact(stem), { file, dir: zohoDir });
}
const overrides = new Map([
  ["TDU-SKP68GM", "Skid Plates .png"], ["TDU-SKP10GM", "Skid Plates .png"],
  ["TDU-SKP12GM", "Skid Plates .png"], ["TDU-SKP14GM", "Skid Plates .png"],
  ["TDU-ASHT04A2SET", "ASHT-SET.png"], ["PCDCUP07H2", "PCDCUP(2).png"],
]);

function choose(productSku) {
  const raw = productSku.trim().toUpperCase();
  const current = exactZoho.get(raw) || exactZoho.get(compact(raw));
  if (current) return { ...current, reason: "exact-current-zoho" };
  if (overrides.has(raw)) return { file: overrides.get(raw), dir: localDir, reason: "manual-override" };
  if (/^DMPR.*A$/i.test(raw)) return { file: "DMPR(A).png", dir: localDir, reason: "sku-a-variant" };
  if (/^DMPR.*B$/i.test(raw)) return { file: "DMPR(B).png", dir: localDir, reason: "sku-b-variant" };
  const sku = clean(raw);
  const matches = candidates.filter((c) => sku === c.key || sku.startsWith(c.key) || c.key.startsWith(sku));
  if (!matches.length) return null;
  matches.sort((a, b) => (b.key === sku) - (a.key === sku) || b.key.length - a.key.length || b.score - a.score || a.file.localeCompare(b.file));
  return { ...matches[0], reason: matches[0].key === sku ? "exact-base" : "longest-prefix" };
}

async function getAccessToken() {
  const dc = process.env.ZOHO_DC || "com";
  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type: "refresh_token",
  });
  const res = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, { method: "POST", body: params });
  if (!res.ok) throw new Error(`Zoho token failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  if (!body.access_token) throw new Error("Zoho token missing access_token");
  return body.access_token;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function uploadToZoho(entry, token) {
  const dc = process.env.ZOHO_DC || "com";
  const org = process.env.ZOHO_ORGANIZATION_ID;
  const bytes = await fs.readFile(entry.sourcePath);
  for (let attempt = 1; attempt <= 4; attempt++) {
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: "image/png" }), entry.publicFile);
    const res = await fetch(`https://www.zohoapis.${dc}/books/v3/items/${encodeURIComponent(entry.itemId)}/image?organization_id=${encodeURIComponent(org)}`, {
      method: "POST",
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      body: form,
    });
    const text = await res.text();
    if (res.ok) return { ok: true, status: res.status, response: text.slice(0, 1000), attempts: attempt };
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
      await sleep(attempt * 1500);
      continue;
    }
    return { ok: false, status: res.status, response: text.slice(0, 2000), attempts: attempt };
  }
}

async function inBatches(items, size, worker) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    results.push(...await Promise.all(batch.map(worker)));
    console.log(`PROGRESS\t${Math.min(i + size, items.length)}/${items.length}`);
  }
  return results;
}

let products;
let originalMap = {};
try {
  products = await prisma.product.findMany({ select: { id: true, sku: true, name: true, description: true } });
  originalMap = JSON.parse(await fs.readFile(mapPath, "utf8"));
  await fs.writeFile(path.join(reportDir, "image-map.before.json"), JSON.stringify(originalMap, null, 2));
  const plan = [];
  for (const product of products) {
    const selected = choose(product.sku);
    if (!selected) continue;
    let parsed = {};
    try { parsed = JSON.parse(product.description || "{}"); } catch { parsed = { text: product.description || "" }; }
    const itemId = parsed.itemId;
    if (!itemId) continue;
    const sourcePath = path.join(selected.dir, selected.file);
    if (!fsSync.existsSync(sourcePath)) throw new Error(`Missing selected image ${sourcePath}`);
    const publicFile = `${path.parse(selected.file).name}-formatted.png`;
    plan.push({ product, parsed, itemId, sourcePath, sourceFile: selected.file, publicFile, publicPath: `/product-images/${publicFile}`, reason: selected.reason });
  }
  await fs.writeFile(path.join(reportDir, "rollback-products.json"), JSON.stringify(plan.map((p) => ({ id: p.product.id, sku: p.product.sku, description: p.product.description })), null, 2));
  await fs.writeFile(path.join(reportDir, "publish-plan.json"), JSON.stringify(plan.map(({ product, parsed, ...p }) => ({ sku: product.sku, name: product.name, ...p, sourcePath: undefined })), null, 2));

  const uniqueFiles = new Map(plan.map((p) => [p.publicFile, p.sourcePath]));
  for (const [publicFile, sourcePath] of uniqueFiles) await fs.copyFile(sourcePath, path.join(publicDir, publicFile));
  console.log(`SYSTEM_FILES\t${uniqueFiles.size}`);

  const nextMap = { ...originalMap };
  for (const entry of plan) {
    entry.parsed.image = entry.publicPath;
    entry.parsed.detail_a = null;
    entry.parsed.detail_b = null;
    entry.parsed.detail_c = null;
    entry.parsed.detail_d = null;
    nextMap[entry.product.sku.trim().toUpperCase()] = { image: entry.publicPath, detail_a: null, detail_b: null, detail_c: null, detail_d: null };
  }
  await fs.writeFile(mapPath, JSON.stringify(nextMap, null, 2));

  await inBatches(plan, 20, async (entry) => {
    await prisma.product.update({ where: { id: entry.product.id }, data: { description: JSON.stringify(entry.parsed) } });
    return true;
  });
  console.log(`SYSTEM_DATABASE\t${plan.length}`);

  const token = await getAccessToken();
  const uploadResults = await inBatches(plan, 4, async (entry) => {
    try {
      return { sku: entry.product.sku, itemId: entry.itemId, sourceFile: entry.sourceFile, ...(await uploadToZoho(entry, token)) };
    } catch (error) {
      return { sku: entry.product.sku, itemId: entry.itemId, sourceFile: entry.sourceFile, ok: false, status: 0, response: String(error), attempts: 1 };
    }
  });
  const succeeded = uploadResults.filter((r) => r.ok).length;
  const failed = uploadResults.filter((r) => !r.ok);
  await fs.writeFile(path.join(reportDir, "zoho-upload-results.json"), JSON.stringify(uploadResults, null, 2));
  await fs.writeFile(path.join(reportDir, "summary.json"), JSON.stringify({ runId, planned: plan.length, uniqueSystemFiles: uniqueFiles.size, systemDatabaseUpdated: plan.length, zohoSucceeded: succeeded, zohoFailed: failed.length }, null, 2));
  console.log(JSON.stringify({ reportDir, planned: plan.length, uniqueSystemFiles: uniqueFiles.size, systemDatabaseUpdated: plan.length, zohoSucceeded: succeeded, zohoFailed: failed.length, failed: failed.slice(0, 20) }, null, 2));
  if (failed.length) process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}
