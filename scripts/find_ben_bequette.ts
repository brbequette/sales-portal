import { prisma } from '../src/lib/prisma';

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: 'Bequette', mode: 'insensitive' } },
        { email: { contains: 'bequette', mode: 'insensitive' } }
      ]
    }
  });

  console.log('Found Users:', JSON.stringify(users, null, 2));

  for (const u of users) {
    const timeEntriesCount = await prisma.timeEntry.count({ where: { userId: u.id } });
    const changeReqsCount = await prisma.timeChangeRequest.count({ where: { userId: u.id } });
    console.log(`User ${u.id} (${u.name} / ${u.email}): ${timeEntriesCount} time entries, ${changeReqsCount} change requests`);
  }

  process.exit(0);
}

main().catch(console.error);
