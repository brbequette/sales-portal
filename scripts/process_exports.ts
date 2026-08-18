import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const INPUT_DIR = 'C:/Users/titan/Documents/Titan Diamond/invoices';
const OUTPUT_DIR = path.join(INPUT_DIR, 'calculated_exports');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function toCSVLine(values: any[]): string {
  return values.map(v => {
    if (v === null || v === undefined) return '';
    const str = String(v);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }).join(',');
}

import * as fs from 'fs';
import * as path from 'path';

async function getProductsMap() {
  const mapBySku = new Map<string, {cost: number, subjectToVig: boolean, giftItem: boolean}>();
  const mapByName = new Map<string, {cost: number, subjectToVig: boolean, giftItem: boolean}>();
  
  const invoicesDir = 'C:/Users/titan/Documents/Titan Diamond/invoices';
  let itemFiles: string[] = [];
  try {
    itemFiles = fs.readdirSync(invoicesDir).filter(f => f.startsWith('Item') && f.endsWith('.csv'));
  } catch (e) {}

  if (itemFiles.length > 0) {
    itemFiles.sort();
    const latestItemFile = itemFiles[itemFiles.length - 1];
    const content = fs.readFileSync(path.join(invoicesDir, latestItemFile), 'utf8');
    const records = require('csv-parse/sync').parse(content, { columns: true, skip_empty_lines: true });
    for (const record of records) {
      const sku = record['SKU'];
      const name = record['Item Name'];
      const rateStr = record['Purchase Rate'] || record['CF.SALESREP COST'] || '0';
      const cost = parseFloat(rateStr.replace(/[^\d.-]/g, '')) || 0;
      const subjStr = (record['CF.SUBJECT TO SALES MARKUP'] || '').toLowerCase();
      const subjectToVig = subjStr === 'true' || subjStr === 'yes' || subjStr === '1';
      const giftStr = (record['CF.GIFT ITEM'] || '').toLowerCase();
      const giftItem = giftStr === 'true' || giftStr === 'yes' || giftStr === '1';
      const pData = { cost, subjectToVig, giftItem };
      if (sku) mapBySku.set(sku.toLowerCase().trim(), pData);
      if (name) mapByName.set(name.toLowerCase().trim(), pData);
    }
    console.log(`Loaded ${records.length} products directly from ${latestItemFile}`);
  } else {
    const products = await prisma.product.findMany();
    for (const p of products) {
      const pData = { cost: (p as any).costBasis || p.price || 0, subjectToVig: p.subjectToVig !== false, giftItem: p.giftItem === true };
      if (p.sku) mapBySku.set(p.sku.toLowerCase().trim(), pData);
      mapByName.set(p.name.toLowerCase().trim(), pData);
    }
  }
  return { mapBySku, mapByName };
}

async function getSettings() {
  const settings = await prisma.systemSetting.findMany();
  let defaultVig = 1.3;
  let defaultComm = 40;
  for (const s of settings) {
    if (s.key === 'vig_percentage' && s.value) defaultVig = parseFloat(s.value);
    if (s.key === 'sales_commission_pct' && s.value) defaultComm = parseFloat(s.value);
  }
  return { defaultVig, defaultComm };
}

async function main() {
  console.log("Starting bulk export processing...");
  const { mapBySku, mapByName } = await getProductsMap();
  const { defaultVig, defaultComm } = await getSettings();

  // Cache invoices for fast payment lookups
  console.log("Caching invoices...");
  const allInvoices = await prisma.invoice.findMany({ select: { id: true, zohoId: true, items: true } });
  const allUsers = await prisma.user.findMany();
  let defaultUserId = allUsers.length > 0 ? allUsers[0].id : null;
  if (!defaultUserId) {
    const defaultUser = await prisma.user.create({ data: { email: 'system@titan.com', name: 'System Import', role: 'ADMIN' } });
    defaultUserId = defaultUser.id;
    allUsers.push(defaultUser);
  }

  const invoiceNumToZohoId = new Map<string, string>();
  for (const inv of allInvoices) {
    const num = (inv.items as any)?.invoiceNumber;
    if (num) invoiceNumToZohoId.set(String(num).trim().toLowerCase(), inv.zohoId);
  }

  // Cache sales documents to prevent slow JSON queries in loop
  console.log("Caching quotes and sales orders...");
  const allQuotes = await prisma.quote.findMany({ select: { id: true, items: true } });
  const allSOs = await prisma.salesOrder.findMany({ select: { id: true, items: true } });
  
  const quoteNumToId = new Map<string, string>();
  const soNumToId = new Map<string, string>();
  const invNumToId = new Map<string, string>();
  
  for (const q of allQuotes) {
    const num = (q.items as any)?.estimateNumber;
    if (num) quoteNumToId.set(String(num).trim().toLowerCase(), q.id);
  }
  for (const s of allSOs) {
    const num = (s.items as any)?.salesOrderNumber;
    if (num) soNumToId.set(String(num).trim().toLowerCase(), s.id);
  }
  for (const inv of allInvoices) {
    const num = (inv.items as any)?.invoiceNumber;
    if (num) invNumToId.set(String(num).trim().toLowerCase(), inv.id);
  }

  const files = fs.readdirSync(INPUT_DIR).filter(f => f.toLowerCase().endsWith('.csv'));

  // --- CROSS-REFERENCE MAPS ---
  const contactMap = new Map();
  const estToPo = new Map();
  const soToEst = new Map();
  const soToPo = new Map();

  console.log("Building Cross-Reference Data Maps...");
  for (const file of files) {
    if (file.startsWith('Contacts') && file.endsWith('.csv')) {
      const lines = fs.readFileSync(path.join(INPUT_DIR, file), 'utf8').split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length > 1) {
        const headers = parseCSVLine(lines[0]).map(h => h.trim().toUpperCase());
        const idIdx = headers.indexOf('CONTACT ID');
        const emailIdx = headers.indexOf('EMAILID');
        const phoneIdx = headers.indexOf('PHONE');
        const mobileIdx = headers.indexOf('MOBILEPHONE');
        const billAddIdx = headers.indexOf('BILLING ADDRESS');
        const shipAddIdx = headers.indexOf('SHIPPING ADDRESS');
        for (let i = 1; i < lines.length; i++) {
          const row = parseCSVLine(lines[i]);
          if (idIdx !== -1 && row[idIdx]) {
             contactMap.set(row[idIdx].trim(), {
               email: (emailIdx !== -1 ? row[emailIdx] : '') || '',
               phone: (phoneIdx !== -1 ? row[phoneIdx] : '') || (mobileIdx !== -1 ? row[mobileIdx] : ''),
               billAdd: billAddIdx !== -1 ? row[billAddIdx] : '',
               shipAdd: shipAddIdx !== -1 ? row[shipAddIdx] : ''
             });
          }
        }
      }
    } else if ((file.startsWith('Quote') || file.startsWith('Sales_Order')) && file.endsWith('.csv')) {
      const lines = fs.readFileSync(path.join(INPUT_DIR, file), 'utf8').split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length > 1) {
        const headers = parseCSVLine(lines[0]).map(h => h.trim().toUpperCase());
        const estIdx = headers.indexOf('ESTIMATE NUMBER') !== -1 ? headers.indexOf('ESTIMATE NUMBER') : headers.indexOf('QUOTE NUMBER');
        const soIdx = headers.indexOf('SALES ORDER NUMBER');
        const poIdx = headers.indexOf('PURCHASEORDER') !== -1 ? headers.indexOf('PURCHASEORDER') : headers.indexOf('CF.PURCHASE ORDER NUMBERS');
        for (let i = 1; i < lines.length; i++) {
          const row = parseCSVLine(lines[i]);
          const estNum = estIdx !== -1 ? row[estIdx]?.trim() : '';
          const soNum = soIdx !== -1 ? row[soIdx]?.trim() : '';
          const poNum = poIdx !== -1 ? row[poIdx]?.trim() : '';
          if (poNum) {
            if (estNum) estToPo.set(estNum, poNum);
            if (soNum) soToPo.set(soNum, poNum);
          }
          if (soNum && estNum) soToEst.set(soNum, estNum);
        }
      }
    }
  }
  // --- END CROSS-REFERENCE MAPS ---

  for (const file of files) {
    console.log(`\nProcessing file: ${file}`);
    const rawData = fs.readFileSync(path.join(INPUT_DIR, file), 'utf8');
    const lines = rawData.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) {
       console.log("-> File is empty or only has headers.");
       continue;
    }

    const originalHeaders = parseCSVLine(lines[0]).map(h => h.trim());
    const isDeals = originalHeaders.includes('Deal Name') || originalHeaders.includes('Stage');
    const isPayments = originalHeaders.includes('Payment Number') || originalHeaders.includes('CustomerPayment ID');
    
    // We only recalculate and export Invoices, SOs, and Quotes
    const isSalesDoc = originalHeaders.some(h => {
      const u = h.toUpperCase();
      return u === 'INVOICE NUMBER' || u === 'SALES ORDER NUMBER' || u === 'ESTIMATE NUMBER' || u === 'INVOICE#' || u === 'ESTIMATE#';
    });

    if (isDeals) {
      console.log("-> Skipping Deals (Already saved to DB in previous run)");
      continue;
      
      console.log("-> Processing Deals");
      let updated = 0;
      
      const dealsToUpsert = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = parseCSVLine(lines[i]);
        const dealId = vals[originalHeaders.indexOf('Record Id')];
        const dealName = vals[originalHeaders.indexOf('Deal Name')];
        const stage = vals[originalHeaders.indexOf('Stage')];
        const amountStr = vals[originalHeaders.indexOf('Amount')];
        const closeDateStr = vals[originalHeaders.indexOf('Closing Date')];
        const accountZohoId = vals[originalHeaders.indexOf('Account Name.id')] || 'unknown-account';
        const accountName = vals[originalHeaders.indexOf('Account Name')] || 'Unknown Account';
        const ownerZohoId = vals[originalHeaders.indexOf('Deal Owner.id')];
        const ownerName = vals[originalHeaders.indexOf('Deal Owner')];
        
        if (!dealId) continue;

        let dealOwnerId = defaultUserId;
        if (ownerZohoId) {
          const user = allUsers.find(u => u.zohoId === ownerZohoId || (u.name && u.name.toLowerCase() === ownerName?.toLowerCase()));
          if (user) dealOwnerId = user.id;
        }
        
        const amount = parseFloat((amountStr || '0').replace(/[$,]/g, ''));
        const closeDate = closeDateStr ? new Date(closeDateStr) : null;
        
        dealsToUpsert.push({
          zohoId: dealId,
          name: dealName || 'Unknown',
          stage: stage || '',
          amount: isNaN(amount) ? 0 : amount,
          closingDate: isNaN(closeDate?.getTime() || 0) ? null : closeDate,
          ownerId: dealOwnerId!,
          accountZohoId: accountZohoId,
          accountName: accountName
        });
      }
      
      const uniqueDeals = new Map();
      const uniqueAccounts = new Map();
      
      for (const d of dealsToUpsert) {
        uniqueDeals.set(d.zohoId, d);
        if (d.accountZohoId) {
          uniqueAccounts.set(d.accountZohoId, { zohoId: d.accountZohoId, name: d.accountName, ownerId: d.ownerId });
        }
      }
      
      const dedupedAccounts = Array.from(uniqueAccounts.values());
      console.log(`   Upserting ${dedupedAccounts.length} unique accounts in chunks...`);
      let accUpdated = 0;
      for (let i = 0; i < dedupedAccounts.length; i += 50) {
        const chunk = dedupedAccounts.slice(i, i + 50);
        await Promise.all(chunk.map(acc => 
          prisma.account.upsert({
            where: { zohoId: acc.zohoId },
            update: { zohoId: acc.zohoId, name: acc.name, owner: { connect: { id: acc.ownerId } } },
            create: { zohoId: acc.zohoId, name: acc.name, owner: { connect: { id: acc.ownerId } } },
          })
        ));
        accUpdated += chunk.length;
      }
      console.log(`   ... Accounts done!`);
      
      const dedupedDeals = Array.from(uniqueDeals.values());
      console.log(`   Upserting ${dedupedDeals.length} deals to DB in chunks...`);
      for (let i = 0; i < dedupedDeals.length; i += 50) {
        const chunk = dedupedDeals.slice(i, i + 50);
        await Promise.all(chunk.map(data => 
          prisma.deal.upsert({
            where: { zohoId: data.zohoId },
            update: {
              zohoId: data.zohoId,
              name: data.name,
              stage: data.stage,
              amount: data.amount,
              closingDate: data.closingDate,
              owner: { connect: { id: data.ownerId } },
              account: { connect: { zohoId: data.accountZohoId } }
            },
            create: {
              zohoId: data.zohoId,
              name: data.name,
              stage: data.stage,
              amount: data.amount,
              closingDate: data.closingDate,
              owner: { connect: { id: data.ownerId } },
              account: { connect: { zohoId: data.accountZohoId } }
            },
          })
        ));
        updated += chunk.length;
        if (updated % 1000 === 0 || updated === dedupedDeals.length) {
          console.log(`   ... ${updated} done`);
        }
      }
      console.log(`   Upserted ${updated} deals.`);
      continue;
    }

    if (isPayments) {
      console.log("-> Skipping Payments (Already saved to DB in previous run)");
      continue;
      
      console.log("-> Processing Payments");
      let updated = 0;
      
      const paymentsToUpsert = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = parseCSVLine(lines[i]);
        const paymentId = vals[originalHeaders.indexOf('CustomerPayment ID')];
        const invoiceNum = vals[originalHeaders.indexOf('Invoice Number')] || vals[originalHeaders.indexOf('Invoice#')];
        const amountStr = vals[originalHeaders.indexOf('Amount')];
        
        if (!paymentId) continue;
        
        // Fast lookup
        let invoiceId = null;
        if (invoiceNum) {
          invoiceId = invoiceNumToZohoId.get(String(invoiceNum).trim().toLowerCase()) || null;
        }
        
        const amount = parseFloat((amountStr || '0').replace(/[$,]/g, ''));
        paymentsToUpsert.push({
          zohoId: paymentId,
          invoiceId: invoiceId || 'unknown',
          amount: isNaN(amount) ? 0 : amount,
          date: new Date(),
          status: 'Success'
        });
      }
      
      const uniquePayments = new Map();
      for (const p of paymentsToUpsert) uniquePayments.set(p.zohoId, p);
      const dedupedPayments = Array.from(uniquePayments.values());
      
      console.log(`   Upserting ${dedupedPayments.length} payments to DB in chunks...`);
      for (let i = 0; i < dedupedPayments.length; i += 50) {
        const chunk = dedupedPayments.slice(i, i + 50);
        await Promise.all(chunk.map(data => 
          prisma.payment.upsert({
            where: { zohoId: data.zohoId },
            update: data,
            create: data,
          })
        ));
        updated += chunk.length;
        if (updated % 1000 === 0 || updated === dedupedPayments.length) {
          console.log(`   ... ${updated} done`);
        }
      }
      console.log(`   Upserted ${updated} payments.`);
      continue;
    }

    const isQuote = /Quote.*\.csv/i.test(file);
    const isSalesOrder = /Sales.*Order.*\.csv/i.test(file);
    const isInvoice = /Invoice.*\.csv/i.test(file);

    if (!isDeals && !isPayments && !isInvoice && !isQuote && !isSalesOrder) {
      console.log(`-> Skipping ${file} (unrecognized type for calculation)`);
      continue;
    }

    console.log("-> Processing Sales Documents with Cost Engine");

    // Add calculation columns if not present
    let newHeaders = [...originalHeaders];
    const ensureHeader = (h: string) => { if (!newHeaders.map(x => x.toUpperCase()).includes(h.toUpperCase())) newHeaders.push(h); };
    
    ensureHeader('CF.DEAD COST TOTAL');
    ensureHeader('CF.SALESPERSON VIG');
    ensureHeader('CF.DEAD COST PLUS VIG');
    ensureHeader('CF.PROFIT');
    ensureHeader('CF.COMMISSION FROM PROFIT %');
    ensureHeader('CF.SALES COMMISSION');
    ensureHeader('CF.ITEMS DC BREAKDOWN');
    ensureHeader('CF.ENGINE RECORD UPDATES');

    const outputRows: string[] = [toCSVLine(newHeaders)];

    // Group rows by Document Number
    const docGroups = new Map<string, any[]>();
    const docNumberColIdx = originalHeaders.findIndex(h => {
      const u = h.toUpperCase();
      return u === 'INVOICE NUMBER' || u === 'SALES ORDER NUMBER' || u === 'SALESORDER NUMBER' || u === 'ESTIMATE NUMBER' || u === 'INVOICE#' || u === 'ESTIMATE#' || u === 'QUOTE NUMBER' || u === 'QUOTE#';
    });
    
    for (let i = 1; i < lines.length; i++) {
      const vals = parseCSVLine(lines[i]);
      const docNum = vals[docNumberColIdx]?.trim();
      if (!docNum) continue;
      if (!docGroups.has(docNum)) docGroups.set(docNum, []);
      docGroups.get(docNum)!.push(vals);
    }

    let docsProcessed = 0;
    const docType = originalHeaders.some(h => h.toUpperCase().includes('INVOICE')) ? 'Invoice' 
                  : originalHeaders.some(h => h.toUpperCase().includes('SALES')) ? 'SalesOrder' : 'Quote';

    for (const [docNum, rows] of docGroups) {
      const firstRow = rows[0];
      
      const getValue = (headerPattern: string) => {
        const idx = originalHeaders.findIndex(h => h.toUpperCase().includes(headerPattern.toUpperCase()));
        return idx !== -1 ? firstRow[idx] : null;
      };

      const getNum = (headerPattern: string) => {
        const val = getValue(headerPattern);
        return parseFloat((val || '0').replace(/[$,]/g, '')) || 0;
      };

      const subTotal = getNum('SUBTOTAL') || getNum('SUB TOTAL');
      const ccFees = getNum('CREDIT CARD PROCESSING');
      const addCosts = getNum('ADDITIONAL COSTS SEE');
      const salesperson = getValue('SALESPERSON');
      const status = getValue('STATUS') || getValue('CUSTOM STATUS') || getValue('INVOICE STATUS');
      const docId = getValue('ID'); // Invoice ID, Estimate ID, etc
      
      const customerName = getValue('CUSTOMER NAME') || 'Unknown Customer';
      const accountZohoId = getValue('CUSTOMER ID') || 'unknown-account';
      const issueDateStr = getValue('ISSUED DATE') || getValue('INVOICE DATE') || getValue('ORDER DATE') || getValue('QUOTE DATE');
      
      const parseDateSafe = (dStr: any) => {
        if (!dStr) return new Date();
        const d = new Date(dStr);
        return isNaN(d.getTime()) ? new Date() : d;
      };

      // Rep-specific VIG logic
      let vigRate = defaultVig;
      if (salesperson?.toLowerCase().includes('montgomery')) vigRate = 1.0;

      let deadCostSubjectToVig = 0;
      let deadCostNoVig = 0;
      const breakdown: string[] = [];
      const lineItemsArr = [];

      for (const row of rows) {
        const getRowVal = (pattern: string) => {
          const idx = originalHeaders.findIndex(h => h.toUpperCase().includes(pattern.toUpperCase()));
          return idx !== -1 ? row[idx] : null;
        };
        const getRowNum = (pattern: string) => parseFloat((getRowVal(pattern) || '0').replace(/[$,]/g, '')) || 0;

        const itemName = getRowVal('ITEM NAME') || '';
        const sku = getRowVal('SKU') || '';
        const qty = getRowNum('QUANTITY') || getRowNum('QUANTITYORDERED') || 1;
        const rate = getRowNum('ITEM PRICE') || getRowNum('RATE');
        
        // Find product cost
        let cost = 0;
        let subjectToVig = true;
        let isGift = itemName.toLowerCase().includes('gift');
        
        let pData = null;
        if (sku && mapBySku.has(sku.toLowerCase())) pData = mapBySku.get(sku.toLowerCase());
        else if (itemName && mapByName.has(itemName.toLowerCase())) pData = mapByName.get(itemName.toLowerCase());

        if (pData) {
          cost = pData.cost;
          subjectToVig = pData.subjectToVig;
          if (pData.giftItem) isGift = true;
        }

        const itemDeadCost = qty * cost;
        const isNoVig = isGift || !subjectToVig; 
        
        if (isNoVig) deadCostNoVig += itemDeadCost;
        else deadCostSubjectToVig += itemDeadCost;

        const vigLabel = isNoVig ? 'No VIG' : 'Subj to VIG';
        const vigDC = isNoVig ? itemDeadCost : itemDeadCost * vigRate;
        breakdown.push(`${qty}x ${sku || itemName} | Cost: $${cost.toFixed(2)} | DC: $${itemDeadCost.toFixed(2)} | VIG-DC: $${vigDC.toFixed(2)} | ${vigLabel}`);
        
        lineItemsArr.push({ itemName, sku, quantity: qty, rate, cost, itemTotal: qty * rate, deadCost: itemDeadCost });
      }

      const deadCostTotal = deadCostSubjectToVig + deadCostNoVig;
      const deadCostPlusVig = (deadCostSubjectToVig * vigRate) + deadCostNoVig;
      const profit = subTotal - deadCostPlusVig - ccFees - addCosts;
      
      const commPct = defaultComm;
      const salesCommission = profit > 0 ? profit * (commPct / 100) : 0;
      const deadProfitActual = subTotal - deadCostTotal;

      // Output to CSV
      for (const row of rows) {
        const newRow = [...row];
        // Ensure newRow matches newHeaders length
        while (newRow.length < newHeaders.length) newRow.push('');
        
        const setVal = (h: string, v: any) => {
          const idx = newHeaders.findIndex(nh => nh.toUpperCase() === h.toUpperCase());
          if (idx !== -1) newRow[idx] = String(v);
        };

        setVal('CF.DEAD COST TOTAL', deadCostTotal.toFixed(2));
        setVal('CF.SALESPERSON VIG', vigRate);
        setVal('CF.DEAD COST PLUS VIG', deadCostPlusVig.toFixed(2));
        setVal('CF.PROFIT', profit.toFixed(2));
        setVal('CF.COMMISSION FROM PROFIT %', commPct);
        setVal('CF.SALES COMMISSION', salesCommission.toFixed(2));
        setVal('CF.ITEMS DC BREAKDOWN', breakdown.join('\n'));
        
        setVal('CF.DEAD COST SUBJECT TO VIG', deadCostSubjectToVig.toFixed(2));
        setVal('CF.DEAD COST NO VIG', deadCostNoVig.toFixed(2));
        setVal('CF.DEAD PROFIT (ACTUAL)', deadProfitActual.toFixed(2));
        setVal('CF.CREDIT CARD PROCESSING FEES', ccFees.toFixed(2));
        setVal('CF.ADDITIONAL COSTS SEE NOTES', addCosts.toFixed(2));

        // --- DATA INJECTION ---
        const updates: string[] = [];
        
        const custIdIdx = originalHeaders.findIndex(h => h.toUpperCase() === 'CUSTOMER ID');
        const custId = custIdIdx !== -1 ? row[custIdIdx]?.trim() : null;
        if (custId && contactMap.has(custId)) {
          const cData = contactMap.get(custId);
          
          const emailIdx = newHeaders.findIndex(h => h.toUpperCase() === 'PRIMARY CONTACT EMAILID');
          if (emailIdx !== -1 && (!newRow[emailIdx] || newRow[emailIdx].trim() === '') && cData.email) {
            newRow[emailIdx] = cData.email;
            updates.push('Email');
          }
          
          const phoneIdx = newHeaders.findIndex(h => h.toUpperCase() === 'PRIMARY CONTACT PHONE');
          if (phoneIdx !== -1 && (!newRow[phoneIdx] || newRow[phoneIdx].trim() === '') && cData.phone) {
            newRow[phoneIdx] = cData.phone;
            updates.push('Phone');
          }
          
          const billIdx = newHeaders.findIndex(h => h.toUpperCase() === 'BILLING ADDRESS');
          if (billIdx !== -1 && (!newRow[billIdx] || newRow[billIdx].trim() === '') && cData.billAdd) {
            newRow[billIdx] = `"${cData.billAdd.replace(/"/g, '""')}"`;
            updates.push('BillAdd');
          }
          
          const shipIdx = newHeaders.findIndex(h => h.toUpperCase() === 'SHIPPING ADDRESS');
          if (shipIdx !== -1 && (!newRow[shipIdx] || newRow[shipIdx].trim() === '') && cData.shipAdd) {
            newRow[shipIdx] = `"${cData.shipAdd.replace(/"/g, '""')}"`;
            updates.push('ShipAdd');
          }
        }
        
        const soNumIdx = originalHeaders.findIndex(h => h.toUpperCase() === 'SALES ORDER NUMBER');
        const soNum = soNumIdx !== -1 ? row[soNumIdx]?.trim() : '';
        
        const estNumIdx = newHeaders.findIndex(h => h.toUpperCase() === 'ESTIMATE NUMBER');
        let currentEstNum = estNumIdx !== -1 ? newRow[estNumIdx]?.trim() : '';
        
        if (!currentEstNum && soNum && soToEst.has(soNum)) {
          currentEstNum = soToEst.get(soNum);
          if (estNumIdx !== -1) {
            newRow[estNumIdx] = currentEstNum;
            updates.push('Estimate#');
          }
        }
        
        const poIdx = newHeaders.findIndex(h => h.toUpperCase() === 'PURCHASEORDER' || h.toUpperCase() === 'CF.PURCHASE ORDER NUMBERS' || h.toUpperCase() === 'CF.REFERENCE');
        if (poIdx !== -1 && (!newRow[poIdx] || newRow[poIdx].trim() === '')) {
          let injectedPo = '';
          if (currentEstNum && estToPo.has(currentEstNum)) injectedPo = estToPo.get(currentEstNum);
          else if (soNum && soToPo.has(soNum)) injectedPo = soToPo.get(soNum);
          
          if (injectedPo) {
            newRow[poIdx] = injectedPo;
            updates.push('PO#');
          }
        }

        if (updates.length > 0) setVal('CF.ENGINE RECORD UPDATES', `Filled missing: ${updates.join(', ')}`);
        else setVal('CF.ENGINE RECORD UPDATES', '');

        // --- END DATA INJECTION ---

        outputRows.push(toCSVLine(newRow));
      }

      // Upsert to DB
      const itemsPayload = {
        docNumber: docNum,
        [docType === 'Invoice' ? 'invoiceNumber' : (docType === 'SalesOrder' ? 'salesOrderNumber' : 'estimateNumber')]: docNum,
        sub_total: subTotal,
        salesperson: salesperson,
        deadCostTotal,
        deadCostSubjectToVig,
        deadCostNoVig,
        deadCostPlusVig,
        profit,
        deadProfitActual,
        vigRate,
        commissionPercent: commPct,
        commission: salesCommission,
        lineItems: lineItemsArr,
        importedFromCsv: true,
      };

      const data = {
        zohoId: docId || `csv-${docNum}`,
        amount: subTotal,
        status: status || 'Sent',
        issueDate: parseDateSafe(issueDateStr),
        items: itemsPayload,
        account: {
          connectOrCreate: {
            where: { zohoId: accountZohoId },
            create: { zohoId: accountZohoId, name: customerName, owner: { connect: { id: defaultUserId! } } }
          }
        }
      };

      // Skipping DB upsert for Sales Documents because we only need the generated CSVs for now
      // and it avoids constraint errors on malformed rows.
      /*
      try {
        if (docType === 'Invoice') {
          const existingId = invNumToId.get(String(docNum).trim().toLowerCase());
          if (existingId) await prisma.invoice.update({ where: { id: existingId }, data });
          else {
            const created = await prisma.invoice.create({ data });
            invNumToId.set(String(docNum).trim().toLowerCase(), created.id);
          }
        } else if (docType === 'SalesOrder') {
          const existingId = soNumToId.get(String(docNum).trim().toLowerCase());
          if (existingId) await prisma.salesOrder.update({ where: { id: existingId }, data });
          else {
             const created = await prisma.salesOrder.create({ data });
             soNumToId.set(String(docNum).trim().toLowerCase(), created.id);
          }
        } else {
          const existingId = quoteNumToId.get(String(docNum).trim().toLowerCase());
          if (existingId) await prisma.quote.update({ where: { id: existingId }, data });
          else {
             const created = await prisma.quote.create({ data });
             quoteNumToId.set(String(docNum).trim().toLowerCase(), created.id);
          }
        }
      } catch (err) {
        console.error(`Error saving ${docNum}:`, err);
      }
      */
      
      docsProcessed++;
    }

    // Write exported CSV
    fs.writeFileSync(path.join(OUTPUT_DIR, file), outputRows.join('\n'));
    console.log(`   Processed ${docsProcessed} documents. Generated ${file} in calculated_exports.`);
  }

  console.log("Done!");
}

main().catch(console.error);
