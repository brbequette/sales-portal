import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isDebugMode } from '@/lib/debug';

export async function GET(req: Request) {
  if (!isDebugMode(req)) {
    return NextResponse.json({ error: 'Debug mode not active' }, { status: 403 });
  }

  try {
    // 1. Find accounts containing "Priority"
    const accounts = await prisma.account.findMany({
      where: {
        name: {
          contains: 'Priority',
          mode: 'insensitive'
        }
      },
      include: {
        invoices: {
          select: { id: true, zohoId: true }
        },
        salesOrders: {
          select: { id: true, zohoId: true }
        }
      }
    });

    // 2. Query matching invoices using PostgreSQL JSONB filtering (highly optimized)
    const matchingInvoices = await prisma.invoice.findMany({
      where: {
        items: {
          path: ['customer_name'],
          string_contains: 'Priority'
        }
      },
      select: {
        id: true,
        zohoId: true,
        accountId: true,
        status: true,
        amount: true,
        issueDate: true
      },
      take: 20
    }).catch(async () => {
      // Fallback if string_contains fails: do a simple search or query raw
      return prisma.$queryRaw`
        SELECT id, "zohoId", "accountId", status, amount, "issueDate" 
        FROM "Invoice" 
        WHERE (items->>'customer_name') ILIKE '%Priority%'
        LIMIT 20
      `;
    });

    // 3. Query matching sales orders using JSONB filtering
    const matchingSalesOrders = await prisma.salesOrder.findMany({
      where: {
        items: {
          path: ['customer_name'],
          string_contains: 'Priority'
        }
      },
      select: {
        id: true,
        zohoId: true,
        accountId: true,
        status: true,
        amount: true,
        orderDate: true
      },
      take: 20
    }).catch(async () => {
      // Fallback to query raw
      return prisma.$queryRaw`
        SELECT id, "zohoId", "accountId", status, amount, "orderDate" 
        FROM "SalesOrder" 
        WHERE (items->>'customer_name') ILIKE '%Priority%'
        LIMIT 20
      `;
    });

    return NextResponse.json({
      success: true,
      accounts: accounts.map(a => ({
        id: a.id,
        zohoId: a.zohoId,
        name: a.name,
        invoicesCount: a.invoices.length,
        salesOrdersCount: a.salesOrders.length,
        invoices: a.invoices,
        salesOrders: a.salesOrders
      })),
      matchingInvoices,
      matchingSalesOrders
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
