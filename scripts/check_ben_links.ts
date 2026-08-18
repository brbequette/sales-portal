import { prisma } from '../src/lib/prisma';

async function main() {
  const duplicateId = 'fbae5e75-7d17-4db5-8219-abb95980602a';
  const primaryId = 'cmppahv5m0000lsi0s00jywp3';

  console.log('Checking references for duplicate ID:', duplicateId);

  const timeEntries = await prisma.timeEntry.count({ where: { userId: duplicateId } });
  const timeChangeRequests = await prisma.timeChangeRequest.count({ where: { userId: duplicateId } });
  const accounts = await prisma.account.count({ where: { ownerId: duplicateId } });
  const deals = await prisma.deal.count({ where: { ownerId: duplicateId } });
  const tasks = await prisma.task.count({ where: { ownerId: duplicateId } });

  console.log('Duplicate ID counts:', { timeEntries, timeChangeRequests, accounts, deals, tasks });

  const primaryCounts = {
    timeEntries: await prisma.timeEntry.count({ where: { userId: primaryId } }),
    timeChangeRequests: await prisma.timeChangeRequest.count({ where: { userId: primaryId } }),
    accounts: await prisma.account.count({ where: { ownerId: primaryId } }),
    deals: await prisma.deal.count({ where: { ownerId: primaryId } }),
    tasks: await prisma.task.count({ where: { ownerId: primaryId } }),
  };
  console.log('Primary ID counts:', primaryCounts);

  process.exit(0);
}

main().catch(console.error);
