const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  const quotes = await prisma.quote.findMany({ select: { items: true, createdAt: true, amount: true, status: true, accountId: true } });
  const sos = await prisma.salesOrder.findMany({ select: { items: true, orderDate: true, amount: true, status: true, accountId: true } });
  const invs = await prisma.invoice.findMany({ select: { items: true, issueDate: true, amount: true, status: true, accountId: true } });
  
  let csv = "Type,Number,Date,Amount,Status,ReferenceNumber,AccountID\n";
  
  for (const q of quotes) {
    const num = q.items?.estimateNumber || q.items?.quote_number || q.items?.reference_number || "";
    const ref = q.items?.reference_number || "";
    const date = q.createdAt ? new Date(q.createdAt).toISOString().split('T')[0] : "";
    csv += `Estimate,"${num}","${date}",${q.amount},"${q.status}","${ref}","${q.accountId}"\n`;
  }
  
  for (const s of sos) {
    const num = s.items?.salesOrderNumber || s.items?.salesorder_number || "";
    const ref = s.items?.reference_number || "";
    const date = s.orderDate ? new Date(s.orderDate).toISOString().split('T')[0] : "";
    csv += `SalesOrder,"${num}","${date}",${s.amount},"${s.status}","${ref}","${s.accountId}"\n`;
  }
  
  for (const i of invs) {
    const num = i.items?.invoiceNumber || i.items?.invoice_number || "";
    const ref = i.items?.reference_number || i.items?.salesorder_number || i.items?.estimateNumber || "";
    const date = i.issueDate ? new Date(i.issueDate).toISOString().split('T')[0] : "";
    csv += `Invoice,"${num}","${date}",${i.amount},"${i.status}","${ref}","${i.accountId}"\n`;
  }
  
  fs.writeFileSync('C:/Users/titan/.gemini/antigravity/brain/811a5568-b2da-4c4a-afff-8e6e1e13b469/documents_export.csv', csv);
  console.log('Exported ' + (quotes.length + sos.length + invs.length) + ' records to CSV.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
