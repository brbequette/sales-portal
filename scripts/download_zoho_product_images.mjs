import fs from "node:fs/promises";
import path from "node:path";

const required = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_ORGANIZATION_ID"];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);
const dc = process.env.ZOHO_DC || "com";
const accountsBase = `https://accounts.zoho.${dc}`;
const apiBase = `https://www.zohoapis.${dc}/books/v3`;
const tokenParams = new URLSearchParams({
  refresh_token: process.env.ZOHO_REFRESH_TOKEN,
  client_id: process.env.ZOHO_CLIENT_ID,
  client_secret: process.env.ZOHO_CLIENT_SECRET,
  grant_type: "refresh_token",
});
const tokenRes = await fetch(`${accountsBase}/oauth/v2/token`, { method: "POST", body: tokenParams });
if (!tokenRes.ok) throw new Error(`Token request failed: ${tokenRes.status} ${await tokenRes.text()}`);
const { access_token: accessToken } = await tokenRes.json();
if (!accessToken) throw new Error("Zoho did not return an access token");
const headers = { Authorization: `Zoho-oauthtoken ${accessToken}` };
const org = process.env.ZOHO_ORGANIZATION_ID;
const outputDir = path.resolve("All Pics/zoho-current-originals");
await fs.mkdir(outputDir, { recursive: true });

const items = [];
for (let page = 1; ; page++) {
  const url = `${apiBase}/items?organization_id=${encodeURIComponent(org)}&page=${page}&per_page=200`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Items page ${page} failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  items.push(...(body.items || []));
  console.log(`PAGE\t${page}\t${(body.items || []).length}\t${items.length}`);
  if (!body.page_context?.has_more_page) break;
}

const withImages = items.filter((item) => item.image_name);
let downloaded = 0;
let skipped = 0;
let failed = 0;
const manifest = [];
for (const [index, item] of withImages.entries()) {
  const rawSku = String(item.sku || item.name || item.item_id).trim();
  const safeSku = rawSku.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/[. ]+$/g, "") || item.item_id;
  const destination = path.join(outputDir, `${safeSku}.png`);
  try {
    const existing = await fs.stat(destination).catch(() => null);
    if (existing?.size > 0) {
      skipped++;
      manifest.push({ itemId: item.item_id, sku: rawSku, imageName: item.image_name, file: path.basename(destination), status: "existing" });
      continue;
    }
    const url = `${apiBase}/items/${encodeURIComponent(item.item_id)}/image?organization_id=${encodeURIComponent(org)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(destination, buffer);
    downloaded++;
    manifest.push({ itemId: item.item_id, sku: rawSku, imageName: item.image_name, file: path.basename(destination), bytes: buffer.length, status: "downloaded" });
    if ((index + 1) % 25 === 0) console.log(`IMAGES\t${index + 1}/${withImages.length}\tdownloaded=${downloaded}\tskipped=${skipped}\tfailed=${failed}`);
  } catch (error) {
    failed++;
    manifest.push({ itemId: item.item_id, sku: rawSku, imageName: item.image_name, status: "failed", error: String(error) });
    console.error(`FAILED\t${rawSku}\t${error}`);
  }
}
await fs.writeFile(path.join(outputDir, "manifest.json"), JSON.stringify({ fetchedAt: new Date().toISOString(), totalItems: items.length, itemsWithImages: withImages.length, downloaded, skipped, failed, items: manifest }, null, 2));
console.log(JSON.stringify({ totalItems: items.length, itemsWithImages: withImages.length, downloaded, skipped, failed, outputDir }));
