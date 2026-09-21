import fs from 'node:fs/promises';
import path from 'node:path';
import { financialZohoLineItems } from '../../src/lib/zoho-line-items.ts';

export const key = value => String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
const number = value => { if (value === null || value === undefined || String(value).trim() === '') return null; const cleaned=String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); if(!cleaned)return null; const n=Number(cleaned[0]); return Number.isFinite(n) && n >= 0 ? n : null; };
export function parseCsv(text) { const rows=[]; let row=[], cell='', quoted=false; for(let i=0;i<text.length;i++){const c=text[i]; if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;} else if(c===','&&!quoted){row.push(cell);cell='';} else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';} else cell+=c;} if(cell||row.length){row.push(cell);rows.push(row);} if(!rows.length)return[]; const headers=rows.shift().map(key); return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??'']))); }
const first = (row, names) => { for (const name of names) { const value = row[key(name)]; if (value !== undefined && String(value).trim() !== '') return value; } return ''; };
export function normalizeSelectedCost(candidate, expectedSource = null) {
  if (!candidate || typeof candidate !== 'object') return null;
  const cost = Number(candidate.cost);
  if (!Number.isFinite(cost) || cost <= 0) return null;
  if (expectedSource && candidate.source !== expectedSource) return null;
  return Object.freeze({ cost, source: candidate.source, sourceRecordId: candidate.sourceRecordId ?? null, effectiveDate: candidate.effectiveDate ?? null, lookupKeyType: candidate.lookupKeyType ?? null });
}
export function buildCatalogCostSources(products = []) {
  const byId = new Map(), bySku = new Map(), byName = new Map();
  const add = (map, lookup, product, lookupKeyType) => { if (!lookup || map.has(lookup)) return; const raw = product.catalogCost ?? product.purchaseCost ?? product.purchaseRate ?? product.unitCost; const candidate = normalizeSelectedCost({ cost: raw, source: 'dbCatalogCost', sourceRecordId: String(product.id ?? product.zohoId ?? ''), effectiveDate: product.updatedAt ?? null, lookupKeyType }); if (candidate) map.set(lookup, candidate); };
  for (const product of products) { const id = String(product.id ?? product.zohoId ?? '').trim(); const sku = key(product.sku); const name = key(product.name); add(byId, id, product, 'catalogItemId'); add(bySku, sku, product, 'catalogSku'); add(byName, name, product, 'exactItemName'); }
  return { catalogById: byId, catalogBySku: bySku, catalogByName: byName };
}
const HISTORICAL_COST_KEYS = Object.freeze(['historicalCost', 'purchase_rate', 'cost', 'unitCost']);
const historicalRows = value => {
  if (!value || typeof value !== 'object') return [];
  const rows = [];
  for (const key of ['line_items', 'lineItems', 'items']) if (Array.isArray(value[key])) rows.push(...financialZohoLineItems(value[key]));
  return rows;
};
export function buildHistoricalInvoiceCostIndex(invoices = []) {
  const byDocument = new Map();
  const stats = { documentsInspected: 0, lineCandidatesFound: 0, candidatesAccepted: 0, ambiguous: 0, malformed: 0, zeroOrInvalid: 0, unresolvedTransitions: 0 };
  for (const invoice of invoices) {
    const rows = [...historicalRows(invoice.items), ...historicalRows(invoice.rawData)];
    if (!rows.length) continue;
    stats.documentsInspected++;
    const entries = [];
    const seen = new Set();
    rows.forEach((row, ordinal) => {
      if (!row || typeof row !== 'object') return;
      const present = HISTORICAL_COST_KEYS.filter(k => Object.prototype.hasOwnProperty.call(row, k));
      if (!present.length) return;
      stats.lineCandidatesFound++;
      const sourceKey = `${String(invoice.zohoId || '')}:${ordinal + 1}`;
      if (seen.has(sourceKey)) { stats.ambiguous++; return; }
      seen.add(sourceKey);
      const raw = present.map(k => row[k]).find(v => v !== null && v !== undefined && String(v).trim() !== '');
      const cost = Number(raw);
      if (!Number.isFinite(cost) || cost <= 0) { stats.zeroOrInvalid++; return; }
      const lineId = String(row.zoho_line_item_id ?? row.zohoLineItemId ?? row.line_item_id ?? '').trim();
      const productId = String(row.item_id ?? row.itemId ?? row.product_id ?? row.productId ?? '').trim();
      const candidate = Object.freeze({ cost, source: 'historicalInvoiceJson', sourceRecordId: lineId || `${String(invoice.zohoId || 'document')}:line:${ordinal + 1}`, effectiveDate: invoice.issueDate ?? null, lookupKeyType: lineId ? 'historicalLineId' : productId ? 'historicalDocumentOrdinal' : 'historicalDocumentOrdinal', lineId, productId, ordinal });
      entries.push(candidate); stats.candidatesAccepted++;
    });
    if (entries.length) byDocument.set(String(invoice.zohoId), entries);
  }
  return { byDocument, stats, supportedKeys: HISTORICAL_COST_KEYS };
}
export function resolveHistoricalInvoiceCost(index, documentId, line, ordinal = 0) {
  const entries = index?.byDocument?.get(String(documentId)) || [];
  const lineId = String(line?.zoho_line_item_id ?? line?.zohoLineItemId ?? '').trim();
  const productId = String(line?.product_id ?? line?.productId ?? line?.item_id ?? '').trim();
  const byId = lineId ? entries.filter(x => x.lineId === lineId) : [];
  const byProduct = productId ? entries.filter(x => x.productId === productId) : [];
  const matches = byId.length === 1 ? byId : byProduct.length === 1 ? byProduct : entries.filter(x => x.ordinal === ordinal);
  if (matches.length !== 1) return null;
  const hit = matches[0];
  return Object.freeze({ cost: hit.cost, source: hit.source, sourceRecordId: hit.sourceRecordId, effectiveDate: hit.effectiveDate, lookupKeyType: byId.length === 1 ? 'historicalLineId' : byProduct.length === 1 ? 'historicalDocumentOrdinal' : 'historicalDocumentOrdinal' });
}
export async function loadCostSources(inputs) {
  const itemFile = path.join(inputs, 'Item (16).csv'); const poFile = path.join(inputs, 'Purchase_Order (13).csv'); const paymentFile = path.join(inputs, 'Customer_Payment (6).csv');
  const [items, purchaseOrders, payments] = await Promise.all([itemFile, poFile, paymentFile].map(async file => parseCsv(await fs.readFile(file, 'utf8'))));
  const itemMap = new Map(), itemById = new Map(); let validItemRates=0; let itemCollisions=0; for(const row of items){const sku=key(first(row,['SKU'])); const itemId=String(first(row,['Item ID'])).trim(); const rate=number(first(row,['Purchase Rate'])); if(rate!==null)validItemRates++; if(rate!==null){const value={cost:rate,source:'itemExportPurchaseRate',sourceRecordId:itemId,effectiveDate:null,lookupKeyType:null,itemId,sku}; if(sku){if(itemMap.has(sku))itemCollisions++;itemMap.set(sku,value);} if(itemId)itemById.set(itemId,value);}}
  const poMapById=new Map(), poMapBySku=new Map(); let validPoRates=0, poCollisions=0; const add=(map,k,v)=>{if(!k)return;if(map.has(k))poCollisions++;if(!map.has(k))map.set(k,[]);map.get(k).push(v);}; for(const row of purchaseOrders){const status=String(first(row,['Purchase Order Status'])).toLowerCase(); if(/void|cancel|delete/.test(status))continue; const poId=String(first(row,['Purchase Order ID'])).trim(); const itemId=String(first(row,['Product ID','Item ID'])).trim(); const sku=key(first(row,['SKU'])); const rate=number(first(row,['Item Price'])); const date=first(row,['Purchase Order Date','Date']); if(rate===null || !poId)continue; validPoRates++; const value={cost:rate,source:'purchaseOrder',sourceRecordId:poId,effectiveDate:date,itemId,sku}; add(poMapById,itemId,value); add(poMapBySku,sku,value);}
  const paymentMap=new Map(); for(const row of payments){const id=String(first(row,['CustomerPayment ID'])).trim(); const invoiceId=String(first(row,['InvoicePayment ID','Invoice ID'])).trim(); const amount=number(first(row,['Amount Applied to Invoice','Amount'])); const value={id,invoiceId,amount,mode:first(row,['Mode']),date:first(row,['Date'])}; if(invoiceId){if(!paymentMap.has(invoiceId))paymentMap.set(invoiceId,[]);paymentMap.get(invoiceId).push(value);}}
  return {items,purchaseOrders,payments,itemMap,itemById,poMapById,poMapBySku,paymentMap,stats:{itemRows:items.length,validItemRates,uniqueItemSkus:itemMap.size,itemIds:itemById.size,itemCollisions,poRows:purchaseOrders.length,validPoRates,poCostMapSize:poMapById.size+poMapBySku.size,poCollisions,paymentRows:payments.length,paymentApplications:paymentMap.size}};
}
export function resolveAuxiliaryCost(line, sources, documentDate) { const itemId=String(line.itemId||line.item_id||line.product_id||'').trim(); const sku=key(line.sku||line.item_sku); const cutoff=documentDate?new Date(documentDate):new Date('9999-12-31'); const choose=(list,keyType)=>Array.isArray(list)?[...list].filter(x=>!x.effectiveDate||new Date(x.effectiveDate)<=cutoff).sort((a,b)=>String(b.effectiveDate||'').localeCompare(String(a.effectiveDate||''))).map(x=>normalizeSelectedCost({...x,lookupKeyType:keyType}))[0]:normalizeSelectedCost(list ? {...list,lookupKeyType:keyType} : null); const poById=choose(itemId?sources.poMapById.get(itemId):null,'itemId'); const poBySku=choose(sku?sources.poMapBySku.get(sku):null,'normalizedSku'); const itemById=choose(itemId?sources.itemById.get(itemId):null,'itemId'); const itemBySku=choose(sku?sources.itemMap.get(sku):null,'normalizedSku'); if(poById)return poById; if(poBySku)return poBySku; if(itemById)return itemById; if(itemBySku)return itemBySku; return null; }
