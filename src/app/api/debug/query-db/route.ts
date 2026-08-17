import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isDebugMode } from '@/lib/debug';

export async function GET(req: Request) {
  // Allow running queries in debug mode
  if (!isDebugMode(req)) {
    return NextResponse.json({ error: 'Debug mode not active' }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "summary";

    if (mode === "summary") {
      // Find accounts containing "Priority"
      const accounts = await prisma.account.findMany({
        where: {
          name: {
            contains: 'Priority',
            mode: 'insensitive'
          }
        },
        include: {
          invoices: true,
          salesOrders: true
        }
      });

      // Find any invoices in DB containing "Priority" in the raw items json
      const allInvoices = await prisma.invoice.findMany({
        select: { id: true, zohoId: true, accountId: true, items: true }
      });
      const matchingInvoices = allInvoices.filter((inv: any) => {
        const name = (inv.items?.customer_name || "").toLowerCase();
        return name.includes("priority");
      }).map((inv: any) => ({
        id: inv.id,
        zohoId: inv.zohoId,
        accountId: inv.accountId,
        customerName: inv.items?.customer_name,
        invoiceNumber: inv.items?.invoice_number
      }));

      // Find any sales orders in DB containing "Priority" in the raw items json
      const allSalesOrders = await prisma.salesOrder.findMany({
        select: { id: true, zohoId: true, accountId: true, items: true }
      });
      const matchingSalesOrders = allSalesOrders.filter((so: any) => {
        const name = (so.items?.customer_name || "").toLowerCase();
        return name.includes("priority");
      }).map((so: any) => ({
        id: so.id,
        zohoId: so.zohoId,
        accountId: so.accountId,
        customerName: so.items?.customer_name,
        salesOrderNumber: so.items?.salesOrderNumber || so.items?.salesorder_number
      }));

      return NextResponse.json({
        success: true,
        accounts: accounts.map(a => ({
          id: a.id,
          zohoId: a.zohoId,
          name: a.name,
          invoicesCount: a.invoices.length,
          salesOrdersCount: a.salesOrders.length
        })),
        matchingInvoices,
        matchingSalesOrders
      });
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
