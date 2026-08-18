const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function getObservedHoliday(year, month, day) {
  const d = new Date(year, month, day);
  const dayOfWeek = d.getDay();
  if (dayOfWeek === 6) {
    // Saturday -> Friday
    d.setDate(d.getDate() - 1);
  } else if (dayOfWeek === 0) {
    // Sunday -> Monday
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function getNthDayOfMonth(year, month, dayOfWeek, n) {
  const d = new Date(year, month, 1);
  while (d.getDay() !== dayOfWeek) {
    d.setDate(d.getDate() + 1);
  }
  if (n === -1) {
    // Last occurrence
    let lastD = new Date(d);
    while (true) {
      d.setDate(d.getDate() + 7);
      if (d.getMonth() === month) {
        lastD = new Date(d);
      } else {
        break;
      }
    }
    return lastD;
  } else {
    d.setDate(d.getDate() + 7 * (n - 1));
    return d;
  }
}

function formatDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
}

async function main() {
  const holidays = [];

  for (let year = 2018; year <= 2035; year++) {
    // New Year's Day
    holidays.push(getObservedHoliday(year, 0, 1));
    // MLK
    holidays.push(getNthDayOfMonth(year, 0, 1, 3));
    // Presidents
    holidays.push(getNthDayOfMonth(year, 1, 1, 3));
    // Memorial
    holidays.push(getNthDayOfMonth(year, 4, 1, -1));
    // Juneteenth (observed since 2021)
    if (year >= 2021) holidays.push(getObservedHoliday(year, 5, 19));
    // Independence Day
    holidays.push(getObservedHoliday(year, 6, 4));
    // Labor Day
    holidays.push(getNthDayOfMonth(year, 8, 1, 1));
    // Columbus
    holidays.push(getNthDayOfMonth(year, 9, 1, 2));
    // Veterans
    holidays.push(getObservedHoliday(year, 10, 11));
    // Thanksgiving
    holidays.push(getNthDayOfMonth(year, 10, 4, 4));
    // Christmas
    holidays.push(getObservedHoliday(year, 11, 25));
  }

  // Remove duplicates and sort
  const formatted = Array.from(new Set(holidays.map(formatDate))).sort();

  console.log("Calculated " + formatted.length + " holidays.");

  const current = await prisma.systemSetting.findUnique({ where: { key: "holidays" } });
  let existing = [];
  if (current && current.value) {
    existing = JSON.parse(current.value);
  }
  
  const merged = Array.from(new Set([...existing, ...formatted])).sort();

  await prisma.systemSetting.upsert({
    where: { key: "holidays" },
    update: { value: JSON.stringify(merged) },
    create: { key: "holidays", value: JSON.stringify(merged) }
  });

  console.log("Successfully seeded holidays into the DB.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
