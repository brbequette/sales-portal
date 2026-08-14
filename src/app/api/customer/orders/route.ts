import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCustomerToken } from '@/lib/customer-auth';

export async function GET(request: NextRequest) {
  try {
    const customer = await verifyCustomerToken(request);
    if (!customer || !customer.accountId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const skip = (page - 1) * limit;

    const invoices = await prisma.invoice.findMany({
      where: { accountId: customer.accountId },
      orderBy: { issueDate: 'desc' },
      skip,
      take: limit,
      include: {
        lineItems: true
      }
    });

    const salesOrders = await prisma.salesOrder.findMany({
      where: { accountId: customer.accountId },
      orderBy: { orderDate: 'desc' },
      skip,
      take: limit,
      include: {
        lineItems: true
      }
    });

    // Get zohoIds to fetch packages
    const salesOrderZohoIds = salesOrders.map(s => s.zohoId).filter(Boolean) as string[];
    const invoiceSalesOrderZohoIds = invoices.map(i => i.salesOrderZohoId).filter(Boolean) as string[];
    const allSoIds = Array.from(new Set([...salesOrderZohoIds, ...invoiceSalesOrderZohoIds]));

    const packages = await prisma.package.findMany({
      where: { salesOrderId: { in: allSoIds } }
    });

    // Combine and sort
    const allOrders = [
      ...invoices.map(i => ({ 
        type: 'invoice', 
        ...i, 
        date: i.issueDate,
        packages: packages.filter(p => p.salesOrderId === i.salesOrderZohoId)
      })),
      ...salesOrders.map(s => ({ 
        type: 'sales_order', 
        ...s, 
        date: s.orderDate,
        packages: packages.filter(p => p.salesOrderId === s.zohoId)
      }))
    ].sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    // Pagination for combined (this applies the limit AFTER combining and sorting)
    const paginatedOrders = allOrders.slice(skip, skip + limit);

    return NextResponse.json({ success: true, data: paginatedOrders });
  } catch (error: any) {
    console.error('Customer orders error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
