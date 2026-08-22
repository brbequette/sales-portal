import fs from "node:fs/promises";
import path from "node:path";

const reportDir = process.argv[2];
if (!reportDir) throw new Error("Usage: node retry_failed_zoho_image_uploads.mjs <report-dir>");
const plan = JSON.parse(await fs.readFile(path.join(reportDir, "publish-plan.json"), "utf8"));
const prior = JSON.parse(await fs.readFile(path.join(reportDir, "zoho-upload-results.json"), "utf8"));
const successfulSkus = new Set(prior.filter((r) => r.ok).map((r) => r.sku));
const queue = plan.filter((p) => !successfulSkus.has(p.sku));
const publicDir = path.resolve("public/product-images");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function token() {
  const dc = process.env.ZOHO_DC || "com";
  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type: "refresh_token",
  });
  const res = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, { method: "POST", body: params });
  if (!res.ok) throw new Error(`Token failed ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

let accessToken = await token();
const retryResults = [];
for (let index = 0; index < queue.length; index++) {
  const entry = queue[index];
  const bytes = await fs.readFile(path.join(publicDir, entry.publicFile));
  let finalResult = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    const form = new FormData();
    form.append("image", new Blob([bytes], { type: "image/png" }), entry.publicFile);
    const dc = process.env.ZOHO_DC || "com";
    const url = `https://www.zohoapis.${dc}/books/v3/items/${encodeURIComponent(entry.itemId)}/image?organization_id=${encodeURIComponent(process.env.ZOHO_ORGANIZATION_ID)}`;
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }, body: form });
    const response = await res.text();
    if (res.ok) {
      finalResult = { sku: entry.sku, itemId: entry.itemId, ok: true, status: res.status, attempts: attempt, response: response.slice(0, 1000) };
      break;
    }
    if (res.status === 401) {
      accessToken = await token();
      await sleep(2000);
      continue;
    }
    if (res.status === 429) {
      console.log(`RATE_LIMIT\t${index + 1}/${queue.length}\t${entry.sku}\tcooldown=60s\tattempt=${attempt}`);
      await sleep(60000);
      continue;
    }
    if (res.status >= 500 && attempt < 10) {
      await sleep(attempt * 5000);
      continue;
    }
    finalResult = { sku: entry.sku, itemId: entry.itemId, ok: false, status: res.status, attempts: attempt, response: response.slice(0, 2000) };
    break;
  }
  if (!finalResult) finalResult = { sku: entry.sku, itemId: entry.itemId, ok: false, status: 429, attempts: 10, response: "Rate limit persisted after ten cooldowns" };
  retryResults.push(finalResult);
  await fs.writeFile(path.join(reportDir, "zoho-retry-results.partial.json"), JSON.stringify(retryResults, null, 2));
  console.log(`RETRY_PROGRESS\t${index + 1}/${queue.length}\t${finalResult.ok ? "OK" : "FAILED"}\t${entry.sku}`);
  await sleep(2200);
}

const combined = [...prior.filter((r) => r.ok), ...retryResults];
const succeeded = combined.filter((r) => r.ok).length;
const failed = combined.filter((r) => !r.ok);
await fs.writeFile(path.join(reportDir, "zoho-upload-results.final.json"), JSON.stringify(combined, null, 2));
await fs.writeFile(path.join(reportDir, "summary.final.json"), JSON.stringify({ total: plan.length, succeeded, failed: failed.length }, null, 2));
console.log(JSON.stringify({ total: plan.length, succeeded, failed: failed.length, failures: failed.slice(0, 30) }, null, 2));
if (failed.length) process.exitCode = 2;
