import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCustomerToken } from '@/lib/customer-auth';

export async function GET(request: NextRequest) {
  try {
    const customer = await verifyCustomerToken(request);
    if (!customer || !customer.accountId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get all line items for this account's invoices
    const invoices = await prisma.invoice.findMany({
      where: { accountId: customer.accountId },
      select: {
        issueDate: true,
        lineItems: {
          select: {
            sku: true,
            productName: true,
            quantity: true,
            unitPrice: true
          }
        }
      }
    });

    const productMap = new Map<string, any>();

    for (const invoice of invoices) {
      for (const item of invoice.lineItems) {
        if (!item.sku) continue;

        const existing = productMap.get(item.sku);
        if (existing) {
          existing.totalQuantity += item.quantity;
          if (new Date(invoice.issueDate) > new Date(existing.lastPurchaseDate)) {
            existing.lastPurchaseDate = invoice.issueDate;
            existing.unitPrice = item.unitPrice; // Use latest price
          }
        } else {
          productMap.set(item.sku, {
            sku: item.sku,
            name: item.productName,
            totalQuantity: item.quantity,
            lastPurchaseDate: invoice.issueDate,
            unitPrice: item.unitPrice
          });
        }
      }
    }

    const blades = Array.from(productMap.values()).sort((a, b) => 
      new Date(b.lastPurchaseDate).getTime() - new Date(a.lastPurchaseDate).getTime()
    );

    return NextResponse.json({ success: true, data: blades });
  } catch (error: any) {
    console.error('Customer blades error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
