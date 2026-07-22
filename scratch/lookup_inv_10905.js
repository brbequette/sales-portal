const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const inv = await prisma.invoice.findFirst({
    where: { OR: [
      { items: { path: ['invoiceNumber'], equals: 'INV-10905' } },
      { items: { path: ['invoiceNumber'], equals: '10905' } }
    ]},
    select: { id: true, zohoId: true, status: true, issueDate: true, costsCalculatedAt: true, pendingCostSync: true, items: true }
  });
  if (!inv) { console.log('NOT FOUND IN DB'); process.exit(0); }
  const items = inv.items || {};
  console.log('Status:', inv.status);
  console.log('IssueDate:', inv.issueDate);
  console.log('CostsCalcAt:', inv.costsCalculatedAt);
  console.log('PendingSync:', inv.pendingCostSync);
  console.log('ZohoId:', inv.zohoId);
  console.log('DeadCostTotal:', items.deadCostTotal);
  console.log('Profit:', items.profit);
  console.log('VigRate:', items.vigRate || items.cf_salesperson_vig);
  const lineItems = items.line_items || [];
  console.log('LineItems count:', lineItems.length);
  const hasPC = lineItems.some(l => parseFloat(l.purchase_rate) > 0);
  console.log('Has purchase_rate:', hasPC);
  if (lineItems.length > 0) {
    console.log('Sample item:', JSON.stringify(lineItems[0], null, 2));
  }
  await prisma.$disconnect();
})();
