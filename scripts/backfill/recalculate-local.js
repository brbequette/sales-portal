const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("Recalculating local profits and commissions...");
  const allInvoices = await prisma.invoice.findMany({ select: { zohoId: true, items: true, status: true } });

  let updated = 0;
  for (const inv of allInvoices) {
    if (!inv.items) continue;
    let items = inv.items;
    
    // Calculate CC Fee total
    const cfs = items.custom_fields || [];
    const ccCf = cfs.find(c => c.label && c.label.toUpperCase().includes('CREDIT CARD PROCESSING'));
    const ccFee = ccCf ? parseFloat(ccCf.value || 0) : 0;
    
    // Only update if there is a CC fee
    if (ccFee > 0) {
      const deadCost = parseFloat(items.deadCostTotal || 0);
      const subTotal = parseFloat(items.sub_total || 0);
      
      // Profit = Subtotal - DeadCost - CC Fees
      const newProfit = subTotal - deadCost - ccFee;
      
      // Commission = Profit * 0.5 (assuming standard 50% split)
      const newCommission = newProfit * 0.50;
      
      items.profit = newProfit.toFixed(2);
      items.commission = newCommission.toFixed(2);
      
      // Set the pending fields so the existing sync script pushes this to Zoho!
      items.pendingZohoFields = {
        profit: items.profit,
        commission: items.commission,
        ccFees: ccFee.toFixed(2)
      };

      await prisma.invoice.update({
        where: { zohoId: inv.zohoId },
        data: { 
          items,
          pendingCostSync: true 
        }
      });
      updated++;
    }
  }

  console.log(`Successfully recalculated profit and commission for ${updated} invoices with CC fees!`);
  console.log(`They are now queued to sync back to Zoho Books via the background job.`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
