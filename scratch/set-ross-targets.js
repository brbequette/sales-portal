const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "ross@titandiamond.net" }
  });

  if (!user) {
    console.log("User not found!");
    return;
  }

  await prisma.systemSetting.upsert({
    where: { key: `TARGET_DAILY_PROFIT_${user.id}` },
    update: { value: "1000" },
    create: { key: `TARGET_DAILY_PROFIT_${user.id}`, value: "1000" }
  });

  await prisma.systemSetting.upsert({
    where: { key: `TARGET_DAILY_SUBTOTAL_${user.id}` },
    update: { value: "2000" },
    create: { key: `TARGET_DAILY_SUBTOTAL_${user.id}`, value: "2000" }
  });

  console.log(`Successfully updated goals for Ross Haisler: Profit = $1000, Subtotal = $2000`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
