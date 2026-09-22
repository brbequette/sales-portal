import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCustomerToken } from '@/lib/customer-auth';
import { databaseReadHeaders, getDatabaseFreshness, LOCAL_DATA_INCOMPLETE } from '@/lib/database-read-metadata';

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
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
        contacts: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          take: 25,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            mobilePhone: true,
            isPrimary: true,
          },
        },
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

    const freshness = await getDatabaseFreshness();
    return NextResponse.json({ success: true, data: account, freshness }, {
      headers: databaseReadHeaders(startedAt, 2),
    });
  } catch (error: any) {
    console.error('Customer account error:', error);
    return NextResponse.json({ success: false, data: null, error: LOCAL_DATA_INCOMPLETE }, {
      status: 500,
      headers: databaseReadHeaders(startedAt, 0),
    });
  }
}
