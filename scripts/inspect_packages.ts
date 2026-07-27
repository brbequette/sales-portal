import { prisma } from '../src/lib/prisma';

async function main() {
  const pkgs = await prisma.package.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  console.log(`Found ${pkgs.length} sample packages in DB:`);
  for (const p of pkgs) {
    console.log('--- Package ---');
    console.log('ID:', p.id, 'ZohoID:', p.zohoId, 'PkgNumber:', p.packageNumber);
    console.log('SO ID:', p.salesOrderId, 'SO Number:', p.salesOrderNumber);
    console.log('Items Raw:', JSON.stringify(p.items));
  }
  process.exit(0);
}

main().catch(console.error);
