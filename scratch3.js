const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const account = await prisma.account.findFirst({
    where: { name: "BEN BEQUETTE" },
    include: { contacts: true }
  });
  console.log("ACCOUNT:", JSON.stringify(account, null, 2));
}

main().finally(() => prisma.$disconnect());
