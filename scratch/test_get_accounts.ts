import { prisma } from "../src/lib/prisma";

async function main() {
  const totalAccounts = await prisma.account.count();
  console.log("Total accounts in DB:", totalAccounts);

  const users = await prisma.user.findMany();
  console.log("Users in DB:", users.map(u => ({ id: u.id, zohoId: u.zohoId, name: u.name, email: u.email, role: u.role })));

  const sampleAccount = await prisma.account.findFirst({
    select: { id: true, name: true, ownerId: true, quality: true, status: true, tags: true }
  });
  console.log("Sample Account:", sampleAccount);
}

main().catch(console.error).finally(() => prisma.$disconnect());
