require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function run() {
  console.log("Starting backfill of lastPurchaseAt for all accounts...");
  const accounts = await p.account.findMany({
    include: { invoices: true }
  })
  
  let updatedCount = 0;
  const now = new Date();
  
  // Use sequential updates to not overload the DB connection
  for (const acc of accounts) {
    if (acc.invoices && acc.invoices.length > 0) {
      let maxDate = 0;
      
      for (const inv of acc.invoices) {
        const items = inv.items || {};
        const dStr = items.paymentDate || inv.issueDate;
        if (dStr) {
          const t = new Date(dStr).getTime();
          if (t > maxDate) {
            maxDate = t;
          }
        }
      }
      
      if (maxDate > 0) {
        const lastPurchaseDate = new Date(maxDate);
        let status = 'Open';
        
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
        
        status = lastPurchaseDate < twelveMonthsAgo ? 'Update Status' : 'Personal';
        
        await p.account.update({
          where: { id: acc.id },
          data: {
            lastPurchaseAt: lastPurchaseDate,
            status: status
          }
        });
        
        updatedCount++;
        if (updatedCount % 100 === 0) {
          console.log(`Processed ${updatedCount} accounts...`);
        }
      }
    }
  }
  
  console.log(`\nBackfill complete!`);
  console.log(`Total Accounts Scanned: ${accounts.length}`);
  console.log(`Accounts successfully updated with valid last purchase dates: ${updatedCount}`);
  
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
})
