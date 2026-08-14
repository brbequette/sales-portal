import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCustomerToken } from '@/lib/customer-auth';

export async function GET(request: NextRequest) {
  try {
    const customer = await verifyCustomerToken(request);
    if (!customer || !customer.accountId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const account = await prisma.account.findUnique({
      where: { id: customer.accountId },
      select: {
        id: true,
        name: true,
        quality: true,
        billingStreet: true,
        billingCity: true,
        billingState: true,
        billingZip: true,
        shippingStreet: true,
        shippingCity: true,
        shippingState: true,
        shippingZip: true,
        owner: {
          select: {
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: account });
  } catch (error: any) {
    console.error('Customer account error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
