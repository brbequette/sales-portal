const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const invs = await prisma.invoice.findMany({
    select: { id: true, amount: true, items: true, status: true, issueDate: true }
  });
  
  const danielInvs = invs.filter(i => {
    const sp = (i.items || {}).salesperson;
    return sp && sp.toLowerCase().includes('daniel charles');
  });
  
  console.log('Daniel Charles Invoices:', danielInvs.length);
  
  let totalProfit = 0;
  let totalEarned = 0;
  
  danielInvs.forEach(i => {
    const profit = parseFloat(i.items.profit || 0);
    totalProfit += profit;
    
    const isPaid = ['Paid', 'paid', 'Closed', 'closed', 'Fulfilled', 'fulfilled'].includes(i.status);
    const upfront = profit * 0.25;
    const final = isPaid ? profit * 0.25 : 0;
    totalEarned += (upfront + final);
  });
  
  console.log('Total Profit:', totalProfit);
  console.log('Total Earned:', totalEarned);
  
  const top = danielInvs.sort((a,b) => parseFloat(b.items.profit||0) - parseFloat(a.items.profit||0)).slice(0, 5);
  console.log('Top invoice profit:', top.map(i => ({ amount: i.amount, profit: i.items.profit, date: i.issueDate, salesperson: i.items.salesperson, id: i.id })));
}

run().finally(() => prisma.$disconnect());
