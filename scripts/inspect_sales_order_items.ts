import { prisma } from '../src/lib/prisma';

async function main() {
  const sampleSOs = await prisma.salesOrder.findMany({
    take: 5,
    orderBy: { orderDate: 'desc' },
    include: { account: true }
  });

  for (const so of sampleSOs) {
    console.log('--- SalesOrder ---');
    console.log('ID:', so.id, 'ZohoID:', so.zohoId, 'Amount:', so.amount);
    console.log('Account Name:', so.account?.name, 'ShippingStreet:', so.account?.shippingStreet);
    console.log('Items Raw Type:', typeof so.items);
    console.log('Items Keys:', typeof so.items === 'object' && so.items ? Object.keys(so.items as object) : []);
    console.log('Items Content:', JSON.stringify(so.items).substring(0, 300));
  }

  process.exit(0);
}

main().catch(console.error);
