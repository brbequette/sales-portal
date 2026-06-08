const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const deals = await prisma.deal.findMany({});

    const estimates = deals.filter(d => 
      d.name.includes('EST-') || 
      (d.stage && d.stage.toLowerCase().includes('estimate'))
    );

    const pre2026Estimates = estimates.filter(d => {
      const closingDate = d.closingDate ? new Date(d.closingDate) : null;
      if (!closingDate) return false;
      return closingDate.getFullYear() < 2026;
    });

    const stagesCount = {};
    pre2026Estimates.forEach(d => {
      stagesCount[d.stage] = (stagesCount[d.stage] || 0) + 1;
    });

    console.log(`Pre-2026 Estimate Deal Stages Count:`, stagesCount);

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
