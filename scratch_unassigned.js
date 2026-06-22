const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const users = await prisma.user.findMany();
  console.log('Daniel Charles in Users table:', users.some(u => u.name && u.name.toLowerCase().includes('daniel charles')));
  
  const invs = await prisma.invoice.findMany({
    select: { id: true, amount: true, items: true, status: true, issueDate: true }
  });
  
  let unassignedProfit = 0;
  let unassignedEarned = 0;
  let firstUnassignedName = null;
  
  const userByName = new Map(users.map(u => [u.name?.toLowerCase().trim(), u]));
  
  invs.forEach(inv => {
    if (['Void', 'void', 'Draft', 'draft'].includes(inv.status)) return;
    
    const items = inv.items || {};
    const sp = items.salesperson;
    const matchedRep = sp ? userByName.get(sp.toLowerCase().trim()) : null;
    
    if (!matchedRep) {
      if (!firstUnassignedName) firstUnassignedName = sp || "Unassigned";
      
      const profit = parseFloat(items.profit || 0);
      unassignedProfit += profit;
      
      const isPaid = ['Paid', 'paid', 'Closed', 'closed', 'Fulfilled', 'fulfilled'].includes(inv.status);
      const upfront = profit * 0.25;
      const final = isPaid ? profit * 0.25 : 0;
      unassignedEarned += (upfront + final);
    }
  });
  
  console.log('First Unassigned Name:', firstUnassignedName);
  console.log('Total Unassigned Profit:', unassignedProfit);
  console.log('Total Unassigned Earned:', unassignedEarned);
}

run().finally(() => prisma.$disconnect());
