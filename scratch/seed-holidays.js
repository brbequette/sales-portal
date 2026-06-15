const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function getNthDayOfMonth(year, month, dayOfWeek, n) {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    let date = new Date(year, month, d);
    if (date.getMonth() !== month) break;
    if (date.getDay() === dayOfWeek) {
      count++;
      if (count === n) return date;
    }
  }
  return null;
}

function getLastDayOfMonth(year, month, dayOfWeek) {
  let last = null;
  for (let d = 1; d <= 31; d++) {
    let date = new Date(year, month, d);
    if (date.getMonth() !== month) break;
    if (date.getDay() === dayOfWeek) last = date;
  }
  return last;
}

function observeDate(date) {
  const d = new Date(date);
  if (d.getDay() === 0) { // Sunday -> Monday
    d.setDate(d.getDate() + 1);
  } else if (d.getDay() === 6) { // Saturday -> Friday
    d.setDate(d.getDate() - 1);
  }
  return d;
}

function format(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const holidays = [];

for (let y = 2018; y <= 2028; y++) {
  holidays.push({ date: format(observeDate(new Date(y, 0, 1))), description: "New Year's Day" });
  holidays.push({ date: format(getNthDayOfMonth(y, 0, 1, 3)), description: "Martin Luther King Jr. Day" });
  holidays.push({ date: format(getNthDayOfMonth(y, 1, 1, 3)), description: "Washington's Birthday" });
  holidays.push({ date: format(getLastDayOfMonth(y, 4, 1)), description: "Memorial Day" });
  
  if (y >= 2021) {
    holidays.push({ date: format(observeDate(new Date(y, 5, 19))), description: "Juneteenth" });
  }
  
  holidays.push({ date: format(observeDate(new Date(y, 6, 4))), description: "Independence Day" });
  holidays.push({ date: format(getNthDayOfMonth(y, 8, 1, 1)), description: "Labor Day" });
  holidays.push({ date: format(getNthDayOfMonth(y, 9, 1, 2)), description: "Columbus Day" });
  holidays.push({ date: format(observeDate(new Date(y, 10, 11))), description: "Veterans Day" });
  holidays.push({ date: format(getNthDayOfMonth(y, 10, 4, 4)), description: "Thanksgiving Day" });
  holidays.push({ date: format(observeDate(new Date(y, 11, 25))), description: "Christmas Day" });
}

async function main() {
  await prisma.systemSetting.upsert({
    where: { key: "holidays" },
    update: { value: JSON.stringify(holidays) },
    create: { key: "holidays", value: JSON.stringify(holidays) }
  });

  console.log(`Successfully seeded ${holidays.length} government holidays from 2018 to 2028 in system settings.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
