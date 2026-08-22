import fs from "node:fs/promises";
import path from "node:path";

const reportDir = path.resolve("outputs/zoho-image-publish/2026-08-21T20-29-58-107Z");
const publicDir = path.resolve("public/product-images");
const plan = JSON.parse(await fs.readFile(path.join(reportDir, "publish-plan.json"), "utf8"));
const firstResults = JSON.parse(await fs.readFile(path.join(reportDir, "zoho-upload-results.json"), "utf8"));
const themes = JSON.parse(await fs.readFile(path.join(reportDir, "titan-theme-zoho-queue.json"), "utf8"));
const priorFinalPath = path.join(reportDir, "unified-zoho-results.partial.json");
const prior = await fs.readFile(priorFinalPath, "utf8").then(JSON.parse).catch(() => []);
const done = new Set(prior.filter((r) => r.ok).map((r) => r.sku));
const failedFirst = new Set(firstResults.filter((r) => !r.ok).map((r) => r.sku));
const themeBySku = new Map(themes.map((r) => [r.sku, r]));
const queueBySku = new Map();
for (const entry of plan) {
  if (!failedFirst.has(entry.sku)) continue;
  queueBySku.set(entry.sku, themeBySku.get(entry.sku) || entry);
}
for (const entry of themes) queueBySku.set(entry.sku, entry);
const queue = [...queueBySku.values()].filter((r) => !done.has(r.sku));
const results = [...prior];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getToken() {
  const dc = process.env.ZOHO_DC || "com";
  const params = new URLSearchParams({ refresh_token: process.env.ZOHO_REFRESH_TOKEN, client_id: process.env.ZOHO_CLIENT_ID, client_secret: process.env.ZOHO_CLIENT_SECRET, grant_type: "refresh_token" });
  const res = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, { method: "POST", body: params });
  if (!res.ok) throw new Error(`Token failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

let token = await getToken();
for (let index = 0; index < queue.length; index++) {
  const entry = queue[index];
  const bytes = await fs.readFile(path.join(publicDir, entry.publicFile));
  let result = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: "image/png" }), entry.publicFile);
    const dc = process.env.ZOHO_DC || "com";
    const url = `https://www.zohoapis.${dc}/books/v3/items/${encodeURIComponent(entry.itemId)}/image?organization_id=${encodeURIComponent(process.env.ZOHO_ORGANIZATION_ID)}`;
    const response = await fetch(url, { method: "POST", headers: { Authorization: `Zoho-oauthtoken ${token}` }, body: form });
    const text = await response.text();
    if (response.ok) { result = { sku: entry.sku, itemId: entry.itemId, publicFile: entry.publicFile, ok: true, status: response.status, attempts: attempt }; break; }
    if (response.status === 401) { token = await getToken(); await sleep(3000); continue; }
    if (response.status === 429) {
      console.log(`SECURITY_COOLDOWN\t${index + 1}/${queue.length}\t${entry.sku}\t300s\tattempt=${attempt}`);
      await sleep(300000);
      continue;
    }
    if (response.status >= 500 && attempt < 5) { await sleep(attempt * 10000); continue; }
    result = { sku: entry.sku, itemId: entry.itemId, publicFile: entry.publicFile, ok: false, status: response.status, attempts: attempt, response: text.slice(0, 2000) };
    break;
  }
  if (!result) result = { sku: entry.sku, itemId: entry.itemId, publicFile: entry.publicFile, ok: false, status: 429, attempts: 5, response: "Zoho security block persisted after five 5-minute cooldowns" };
  results.push(result);
  await fs.writeFile(priorFinalPath, JSON.stringify(results, null, 2));
  console.log(`UNIFIED_PROGRESS\t${index + 1}/${queue.length}\t${result.ok ? "OK" : "FAILED"}\t${entry.sku}`);
  await sleep(3000);
}
const succeeded = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
await fs.writeFile(path.join(reportDir, "unified-zoho-results.final.json"), JSON.stringify(results, null, 2));
await fs.writeFile(path.join(reportDir, "summary.unified.final.json"), JSON.stringify({ queued: queueBySku.size, succeeded, failed: failed.length }, null, 2));
console.log(JSON.stringify({ queued: queueBySku.size, succeeded, failed: failed.length, failures: failed.slice(0, 25) }, null, 2));
if (failed.length) process.exitCode = 2;
