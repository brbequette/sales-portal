import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isDebugMode } from '@/lib/debug';
import { requireAdministrator } from '@/lib/auth-helpers';

export async function GET(req: Request) {
  const auth = await requireAdministrator();
  if (auth.errorResponse) return auth.errorResponse;

  if (!isDebugMode(req)) {
    return NextResponse.json({ error: 'Debug mode not active' }, { status: 403 });
  }

  try {
    console.log("Checking specific Account in DB...");
    // 1. Try finding by zohoId (CRM ID)
    const accountByCrmId = await prisma.account.findFirst({
      where: {
        OR: [
          { zohoId: "6821836000024365052" },
          { name: { contains: "1 Priority", mode: "insensitive" } }
        ]
      },
      include: {
        invoices: {
          select: { id: true, zohoId: true, amount: true, status: true, issueDate: true }
        },
        salesOrders: {
          select: { id: true, zohoId: true, amount: true, status: true, orderDate: true }
        }
      }
    });

    // 2. Find any invoices linked to this account ID
    let invoicesForAccount: any[] = [];
    if (accountByCrmId) {
      invoicesForAccount = await prisma.invoice.findMany({
        where: { accountId: accountByCrmId.id },
        select: { id: true, zohoId: true, amount: true, status: true }
      });
    }

    return NextResponse.json({
      success: true,
      account: accountByCrmId ? {
        id: accountByCrmId.id,
        zohoId: accountByCrmId.zohoId,
        name: accountByCrmId.name,
        invoicesCount: accountByCrmId.invoices.length,
        salesOrdersCount: accountByCrmId.salesOrders.length,
        invoices: accountByCrmId.invoices,
        salesOrders: accountByCrmId.salesOrders
      } : null,
      invoicesForAccount
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
