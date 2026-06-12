const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const usHolidays = [
  "2026-01-01", // New Year's Day
  "2026-01-19", // Martin Luther King Jr. Day
  "2026-02-16", // Washington's Birthday (Presidents' Day)
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-04", // Independence Day
  "2026-09-07", // Labor Day
  "2026-10-12", // Columbus Day
  "2026-11-11", // Veterans Day
  "2026-11-26", // Thanksgiving Day
  "2026-12-25", // Christmas Day
  // Adding 2027 as well for foresight
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-05-31",
  "2027-06-18",
  "2027-07-05",
  "2027-09-06",
  "2027-10-11",
  "2027-11-11",
  "2027-11-25",
  "2027-12-24"
];

async function main() {
  const existingSetting = await prisma.systemSetting.findUnique({
    where: { key: "holidays" }
  });

  let currentHolidays = [];
  if (existingSetting && existingSetting.value) {
    try {
      currentHolidays = JSON.parse(existingSetting.value);
    } catch (e) {
      currentHolidays = [];
    }
  }

  // Merge lists uniquely and sort
  const combined = Array.from(new Set([...currentHolidays, ...usHolidays])).sort();

  await prisma.systemSetting.upsert({
    where: { key: "holidays" },
    update: { value: JSON.stringify(combined) },
    create: { key: "holidays", value: JSON.stringify(combined) }
  });

  console.log("Successfully seeded government holidays in system settings.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
