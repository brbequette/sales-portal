const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.time("Query Time");
  try {
    console.log("Querying with precise select (all contacts)...");
    const accounts = await prisma.account.findMany({
      where: {}, // Admin sees all
      orderBy: { name: 'asc' },
      select: {
        id: true,
        zohoId: true,
        name: true,
        tags: true,
        status: true,
        lastPurchaseAt: true,
        ownerId: true,
        industry: true,
        invoices: {
          select: {
            id: true,
            amount: true,
            status: true,
            dueDate: true,
            items: true,
          }
        },
        contacts: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            mobilePhone: true,
            isPrimary: true,
          }
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        }
      }
    });
    
    console.timeEnd("Query Time");
    console.log("Total Accounts:", accounts.length);
    const jsonStr = JSON.stringify({ success: true, accounts });
    console.log("JSON Size (MB):", (jsonStr.length / 1024 / 1024).toFixed(2));
  } catch (error) {
    console.error("Query failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
