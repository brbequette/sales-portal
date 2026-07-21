import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || "664670946";
const ZOHO_DC = process.env.ZOHO_DC || "com";
const BASE_URL = `https://www.zohoapis.${ZOHO_DC}/books/v3`;
const INPUT_DIR = 'C:/Users/titan/Documents/Titan Diamond/invoices/calculated_exports';

const customFieldMaps = {
  invoices: new Map<string, string>(),
  estimates: new Map<string, string>(),
  salesorders: new Map<string, string>()
};

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getToken() {
  const t = await prisma.systemSetting.findUnique({ where: { key: 'zoho_access_token' } });
  if (!t || !t.value) throw new Error("No zoho_access_token in DB");
  return t.value;
}

async function fetchFieldIds(module: string, docId: string, token: string) {
  const endpoint = module === 'quotes' ? 'estimates' : module;
  const url = `${BASE_URL}/${endpoint}/${docId}?organization_id=${ORG_ID}`;
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  const data: any = await res.json();
  if (data.code !== 0) throw new Error(`Zoho: ${data.message}`);
  
  const doc = data[endpoint === 'estimates' ? 'estimate' : (endpoint === 'salesorders' ? 'salesorder' : 'invoice')];
  const fields: any[] = doc.custom_fields || [];
  
  const map = new Map<string, string>();
  for (const f of fields) {
    if (f.label) map.set(f.label.toUpperCase().trim(), f.customfield_id);
    if (f.api_name) map.set(f.api_name, f.customfield_id);
  }
  return map;
}

async function processDocs(file: string, module: string, limit: number, token: string) {
  const filePath = path.join(INPUT_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.log(`Missing ${file}, skipping...`);
    return;
  }
  
  console.log(`\nReading ${file}...`);
  const content = fs.readFileSync(filePath, 'utf8');
  const records = parse(content, { columns: true, skip_empty_lines: true });
  
  if (records.length === 0) return;
  
  const headers = Object.keys(records[0]).map(h => h.trim().toUpperCase());
  
  // Find the exact key for the ID column since casing might differ
  const idKey = Object.keys(records[0]).find(h => {
     const up = h.trim().toUpperCase();
     return up === 'INVOICE ID' || up === 'QUOTE ID' || up === 'ESTIMATE ID' || up === 'SALES ORDER ID' || up === 'SALESORDER ID';
  });
  const dateKey = Object.keys(records[0]).find(h => {
     const up = h.trim().toUpperCase();
     return up === 'INVOICE DATE' || up === 'QUOTE DATE' || up === 'ESTIMATE DATE' || up === 'DATE' || up === 'ISSUED DATE' || up === 'CREATED TIME';
  });
  const numKey = Object.keys(records[0]).find(h => {
     const up = h.trim().toUpperCase();
     return up === 'INVOICE NUMBER' || up === 'QUOTE NUMBER' || up === 'ESTIMATE NUMBER' || up === 'SALES ORDER NUMBER';
  });
  
  if (!idKey) {
    console.log(`Could not find ID column in ${file}`);
    return;
  }
  
  // Deduplicate and parse dates
  const parsedRows = [];
  const seenIds = new Set<string>();
  
  for (const row of records) {
    const id = row[idKey];
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    
    parsedRows.push({
      id: id,
      num: numKey ? row[numKey] : 'Unknown',
      date: (dateKey && row[dateKey]) ? new Date(row[dateKey]).getTime() : 0,
      row: row
    });
  }
  
  // Sort by newest first
  parsedRows.sort((a, b) => b.date - a.date);
  const targetDocs = parsedRows.slice(0, limit);
  console.log(`Found ${parsedRows.length} unique docs. Processing newest ${targetDocs.length}...`);
  
  if (targetDocs.length === 0) return;
  
  const endpoint = module === 'quotes' ? 'estimates' : module;
  
  // Fetch custom field IDs from the first doc
  console.log(`Bootstrapping custom fields for ${module}...`);
  let fieldMap;
  try {
     fieldMap = await fetchFieldIds(module, targetDocs[0].id, token);
  } catch (e: any) {
     console.error(`Failed to bootstrap fields: ${e.message}`);
     return;
  }
  
  const FIELDS_TO_PUSH = [
    'CF.DEAD COST TOTAL', 'CF.DEAD COST SUBJECT TO VIG', 'CF.DEAD COST NO VIG',
    'CF.SALESPERSON VIG', 'CF.DEAD COST PLUS VIG', 'CF.PROFIT', 
    'CF.COMMISSION FROM PROFIT %', 'CF.SALES COMMISSION', 'CF.ITEMS DC BREAKDOWN',
    'CF.DEAD PROFIT (ACTUAL)', 'CF.CREDIT CARD PROCESSING FEES', 'CF.ADDITIONAL COSTS SEE NOTES',
    'CF.ESTIMATE NUMBER', 'CF.PURCHASE ORDER NUMBERS', 'CF.REFERENCE', 'CF.PAID IN FULL DATE'
  ];
  
  let successCount = 0;
  let errCount = 0;
  
  for (const doc of targetDocs) {
    const customFieldsPayload = [];
    
    for (const f of FIELDS_TO_PUSH) {
      // Find the actual key in the row object that matches this header (case-insensitive)
      const exactKey = Object.keys(doc.row).find(k => k.trim().toUpperCase() === f);
      
      if (exactKey !== undefined) {
        let val = doc.row[exactKey];
        if (val !== undefined && val !== null) {
            val = String(val).trim();
            const cleanLabel = f.replace('CF.', '');
            let fieldId = fieldMap.get(cleanLabel);
            
            // Special mappings
            if (!fieldId && cleanLabel === 'DEAD PROFIT (ACTUAL)') fieldId = fieldMap.get('cf_dead_profit_actual');
            if (!fieldId && cleanLabel === 'REFERENCE') fieldId = fieldMap.get('PurchaseOrder');
            
            if (fieldId && val !== '') {
               let finalVal: string | number = val;
               const numFields = ['DEAD COST TOTAL', 'DEAD COST SUBJECT TO VIG', 'DEAD COST NO VIG', 'SALESPERSON VIG', 'DEAD COST PLUS VIG', 'PROFIT', 'COMMISSION FROM PROFIT %', 'SALES COMMISSION', 'DEAD PROFIT (ACTUAL)', 'CREDIT CARD PROCESSING FEES'];
               if (numFields.includes(cleanLabel) && !isNaN(Number(val))) {
                  finalVal = Number(val);
               }
               customFieldsPayload.push({
                 customfield_id: fieldId,
                 value: finalVal
               });
            }
        }
      }
    }
    
    if (customFieldsPayload.length === 0) {
       console.log(`[SKIP] ${doc.num} - No fields to push`);
       continue;
    }
    
    try {
      const url = `${BASE_URL}/${endpoint}/${doc.id}?organization_id=${ORG_ID}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ custom_fields: customFieldsPayload })
      });
      
      const data: any = await res.json();
      if (data.code === 0) {
         console.log(`[OK] ${doc.num} - Pushed ${customFieldsPayload.length} fields`);
         successCount++;
      } else {
         console.error(`[ERR] ${doc.num} - Zoho: ${data.message}`);
         if (errCount === 0) console.log("Payload was:", JSON.stringify({ custom_fields: customFieldsPayload }));
         errCount++;
      }
    } catch (e: any) {
      console.error(`[ERR] ${doc.num} - ${e.message}`);
      errCount++;
    }
    
    // Rate limit
    await sleep(650);
  }
  
  console.log(`\nFinished ${module}. Success: ${successCount} | Errors: ${errCount}`);
}

async function main() {
  console.log("Starting API Push Engine...");
  try {
    const token = await getToken();
    console.log("Got API token from DB");
    
    await processDocs('Invoice_Combined.csv', 'invoices', 1000, token);
    await processDocs('Quote_Combined.csv', 'quotes', 1000, token);
    
    // For SOs, it might just be Sales_Order (6).csv
    const files = fs.readdirSync(INPUT_DIR);
    const soFile = files.find(f => f.startsWith('Sales_Order') && f.endsWith('.csv'));
    if (soFile) {
       await processDocs(soFile, 'salesorders', 1000, token);
    }
    
  } catch (e: any) {
    console.error("Fatal Error:", e.message);
  }
}

main();
