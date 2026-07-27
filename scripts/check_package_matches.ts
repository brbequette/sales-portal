import { prisma } from '../src/lib/prisma';

async function main() {
  const totalPackages = await prisma.package.count();
  const totalSOs = await prisma.salesOrder.count();

  console.log({ totalPackages, totalSOs });

  const samplePackages = await prisma.package.findMany({ take: 10, orderBy: { createdAt: 'desc' } });
  console.log('Sample Packages:', samplePackages.map(p => ({
    id: p.id,
    packageNumber: p.packageNumber,
    salesOrderId: p.salesOrderId,
    salesOrderNumber: p.salesOrderNumber,
    carrier: p.carrier,
    trackingNumber: p.trackingNumber
  })));

  const matchedBySOId = await prisma.package.count({
    where: {
      salesOrderId: { in: (await prisma.salesOrder.findMany({ select: { zohoId: true } })).map(s => s.zohoId) }
    }
  });

  console.log('Matched Packages by zohoId:', matchedBySOId);

  process.exit(0);
}

main().catch(console.error);
