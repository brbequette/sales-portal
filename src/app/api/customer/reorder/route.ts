import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCustomerToken } from '@/lib/customer-auth';

export async function POST(request: NextRequest) {
  try {
    const customer = await verifyCustomerToken(request);
    if (!customer || !customer.accountId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
    }

    // Lookup invoice or sales order
    let lineItems = null;

    const invoice = await prisma.invoice.findFirst({
      where: { id: orderId, accountId: customer.accountId },
      include: { lineItems: true }
    });

    if (invoice) {
      lineItems = invoice.lineItems;
    } else {
      const salesOrder = await prisma.salesOrder.findFirst({
        where: { id: orderId, accountId: customer.accountId },
        include: { lineItems: true }
      });
      if (salesOrder) {
        lineItems = salesOrder.lineItems;
      }
    }

    if (!lineItems) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    // Get current pricing from Product table
    const skus = lineItems.map(item => item.sku).filter(Boolean) as string[];
    const products = await prisma.product.findMany({
      where: { sku: { in: skus } }
    });

    const productMap = new Map(products.map(p => [p.sku, p.price]));

    const cartItems = lineItems
      .filter(item => item.sku)
      .map(item => ({
        sku: item.sku,
        name: item.productName,
        qty: item.quantity,
        currentPrice: productMap.get(item.sku!) || item.unitPrice // Fallback to old price if product missing
      }));

    return NextResponse.json({ success: true, cartItems });
  } catch (error: any) {
    console.error('Customer reorder error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
