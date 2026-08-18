import { prisma } from '../src/lib/prisma';

async function main() {
  const duplicateId = 'fbae5e75-7d17-4db5-8219-abb95980602a';
  const primaryId = 'cmppahv5m0000lsi0s00jywp3';

  console.log('Merging duplicate Ben Bequette accounts...');

  // 1. Double check if duplicate has any records
  const timeEntries = await prisma.timeEntry.count({ where: { userId: duplicateId } });
  const accounts = await prisma.account.count({ where: { ownerId: duplicateId } });

  if (timeEntries > 0 || accounts > 0) {
    console.log(`Re-assigning ${timeEntries} time entries and ${accounts} accounts to primary user...`);
    await prisma.timeEntry.updateMany({
      where: { userId: duplicateId },
      data: { userId: primaryId }
    });
    await prisma.account.updateMany({
      where: { ownerId: duplicateId },
      data: { ownerId: primaryId }
    });
  }

  // 2. Delete duplicate user
  await prisma.user.delete({
    where: { id: duplicateId }
  });

  console.log(`Successfully deleted duplicate user ${duplicateId}.`);

  // 3. Verify primary user
  const primaryUser = await prisma.user.findUnique({
    where: { id: primaryId }
  });

  console.log('Primary Unified Ben Bequette User:', primaryUser);
  process.exit(0);
}

main().catch(console.error);
