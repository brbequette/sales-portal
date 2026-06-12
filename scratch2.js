const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const notes = await prisma.note.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      account: { select: { name: true } }
    }
  });
  console.log("RECENT NOTES:", JSON.stringify(notes, null, 2));
}

main().finally(() => prisma.$disconnect());
