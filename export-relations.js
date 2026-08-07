const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  const sinceDate = new Date('2024-01-01T00:00:00Z');
  
  // We can fetch everything or let prisma filter by date. I will fetch all and filter in JS for simplicity with JSON fields.
  const quotes = await prisma.quote.findMany({ select: { items: true, createdAt: true, amount: true } });
  const sos = await prisma.salesOrder.findMany({ select: { items: true, orderDate: true, amount: true } });
  const invs = await prisma.invoice.findMany({ select: { items: true, issueDate: true, amount: true } });
  
  // Helper to check conditions
  function isValidRecord(record, dateField) {
    if (!record[dateField]) return false;
    const d = new Date(record[dateField]);
    if (d < sinceDate) return false;
    
    // Check salesperson
    const sp = record.items?.salesperson || record.items?.salesperson_name || "";
    if (sp.toUpperCase() !== "ROSS HAISLER") return false;
    
    return true;
  }
  
  const validQuotes = quotes.filter(q => isValidRecord(q, 'createdAt'));
  const validSOs = sos.filter(s => isValidRecord(s, 'orderDate'));
  const validInvs = invs.filter(i => isValidRecord(i, 'issueDate'));
  
  // Maps for lookup
  const estMap = new Map();
  for (const q of validQuotes) {
    const estNum = q.items?.estimateNumber;
    if (estNum) estMap.set(estNum, q);
  }
  
  const soMap = new Map();
  const soByEst = new Map(); // estNum -> SO[]
  for (const s of validSOs) {
    const soNum = s.items?.salesOrderNumber || s.items?.salesorder_number;
    const estRef = s.items?.reference_number;
    if (soNum) soMap.set(soNum, s);
    if (estRef) {
      if (!soByEst.has(estRef)) soByEst.set(estRef, []);
      soByEst.get(estRef).push(s);
    }
  }
  
  let csv = "EST Number,EST Date,SO Number,SO Date,INV Number,INV Date,Amount\n";
  const processedSOs = new Set();
  const processedEsts = new Set();
  
  // 1. Process all Invoices
  for (const i of validInvs) {
    const invNum = i.items?.invoiceNumber || i.items?.invoice_number || "";
    const invDate = i.issueDate ? new Date(i.issueDate).toISOString().split('T')[0] : "";
    const invAmount = i.amount || 0;
    
    let soNum = "", soDate = "";
    let estNum = "", estDate = "";
    
    const soRef = i.items?.salesOrderNumber || i.items?.reference_number;
    if (soRef && soMap.has(soRef)) {
      const s = soMap.get(soRef);
      soNum = soRef;
      soDate = s.orderDate ? new Date(s.orderDate).toISOString().split('T')[0] : "";
      processedSOs.add(soNum);
      
      const estRef = s.items?.reference_number;
      if (estRef && estMap.has(estRef)) {
        const q = estMap.get(estRef);
        estNum = estRef;
        estDate = q.createdAt ? new Date(q.createdAt).toISOString().split('T')[0] : "";
        processedEsts.add(estNum);
      }
    }
    
    csv += `"${estNum}","${estDate}","${soNum}","${soDate}","${invNum}","${invDate}",${invAmount}\n`;
  }
  
  // 2. Process all SalesOrders that have no Invoice
  for (const s of validSOs) {
    const soNum = s.items?.salesOrderNumber || s.items?.salesorder_number || "";
    if (soNum && processedSOs.has(soNum)) continue;
    
    const soDate = s.orderDate ? new Date(s.orderDate).toISOString().split('T')[0] : "";
    const soAmount = s.amount || 0;
    
    let estNum = "", estDate = "";
    const estRef = s.items?.reference_number;
    if (estRef && estMap.has(estRef)) {
      const q = estMap.get(estRef);
      estNum = estRef;
      estDate = q.createdAt ? new Date(q.createdAt).toISOString().split('T')[0] : "";
      processedEsts.add(estNum);
    }
    
    csv += `"${estNum}","${estDate}","${soNum}","${soDate}","","",${soAmount}\n`;
  }
  
  // 3. Process all Estimates that have no SalesOrder
  for (const q of validQuotes) {
    const estNum = q.items?.estimateNumber;
    if (!estNum || processedEsts.has(estNum)) continue;
    
    const estDate = q.createdAt ? new Date(q.createdAt).toISOString().split('T')[0] : "";
    const estAmount = q.amount || 0;
    
    csv += `"${estNum}","${estDate}","","","","",${estAmount}\n`;
  }
  
  fs.writeFileSync('C:/Users/titan/.gemini/antigravity/brain/811a5568-b2da-4c4a-afff-8e6e1e13b469/relations_ross_2024.csv', csv);
  console.log('Exported Ross Haisler relations (since 2024) to CSV.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
