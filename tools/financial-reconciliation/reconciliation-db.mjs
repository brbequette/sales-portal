export async function loadProductionSnapshot({ PrismaClient }) {
  const prisma = new PrismaClient();
  try {
    return await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$queryRawUnsafe('SELECT 1 AS ok');
      const [settings, users, monthlyVigGoals, plans, products, invoices, payments, lineItems, purchaseOrders, fieldMappings] = await Promise.all([
        tx.systemSetting.findMany({ select: { key: true, value: true } }),
        tx.user.findMany({ select: { id: true, zohoId: true, name: true, constantVigEnabled: true, constantVigValue: true } }),
        tx.monthlyVigGoal.findMany({ select: { repId: true, monthKey: true, metric: true, profitGoal: true, subtotalGoal: true, workingDays: true, manualVigRate: true, lastSyncedVigRate: true } }),
        tx.compensationPlan.findMany({ select: { id: true, repId: true, name: true, status: true, startDate: true, endDate: true, commissionRate: true, commissionBasis: true, commitmentEnabled: true, commitmentMetric: true, commitmentTarget: true, commitmentVigRate: true, commitmentGoalType: true, commitmentPenalty: true } }).catch(() => []),
        tx.product.findMany({ select: { sku: true, name: true, price: true, subjectToVig: true, giftItem: true } }),
        tx.invoice.findMany({ select: { zohoId: true, issueDate: true, status: true, isWrittenOff: true, amount: true, items: true, rawData: true, computedProfit: true, computedDeadCost: true, computedVigRate: true, computedSalesperson: true, lineItems: { select: { zohoLineItemId: true, sku: true, quantity: true, total: true, description: true } }, payments: { select: { zohoId: true, invoiceId: true, amount: true, mode: true, date: true, status: true } } } }),
        tx.payment.findMany({ select: { zohoId: true, invoiceId: true, amount: true, mode: true, date: true, status: true } }),
        tx.lineItem.findMany({ select: { invoiceId: true, zohoLineItemId: true, sku: true, quantity: true, total: true, description: true } }).catch(() => []),
        tx.purchaseOrder.findMany({ select: { zohoId: true, invoiceId: true, items: true } }).catch(() => []),
        tx.customFieldMapping.findMany({ where: { isActive: true }, select: { entity: true, apiName: true, internalKey: true, isActive: true } }).catch(() => [])
      ]);
      return { settings: settings.map(x => ({ key: x.key, value: x.value })), users, monthlyVigGoals, plans, products, invoices, payments, lineItems, purchaseOrders, fieldMappings, readOnly: true };
    }, { maxWait: 10000, timeout: 60000 });
  } finally { await prisma.$disconnect(); }
}
