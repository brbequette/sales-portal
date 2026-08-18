import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCustomerToken } from '@/lib/customer-auth';

export async function GET(request: NextRequest) {
  try {
    const customer = await verifyCustomerToken(request);
    if (!customer || !customer.accountId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const bundles = await prisma.autoshipBundle.findMany({
      where: { isActive: true }
    });

    const subscriptions = await prisma.autoshipSubscription.findMany({
      where: { accountId: customer.accountId },
      include: { bundle: true }
    });

    return NextResponse.json({ success: true, data: { bundles, subscriptions } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const customer = await verifyCustomerToken(request);
    if (!customer || !customer.accountId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { bundleId, frequency } = await request.json();
    if (!bundleId || !frequency) {
      return NextResponse.json({ success: false, error: 'Bundle ID and frequency are required' }, { status: 400 });
    }

    const bundle = await prisma.autoshipBundle.findUnique({ where: { id: bundleId } });
    if (!bundle) {
      return NextResponse.json({ success: false, error: 'Bundle not found' }, { status: 404 });
    }

    // Calculate next ship date (simplistic implementation)
    let nextShipDate = new Date();
    if (frequency === 'monthly') nextShipDate.setMonth(nextShipDate.getMonth() + 1);
    else if (frequency === 'quarterly') nextShipDate.setMonth(nextShipDate.getMonth() + 3);
    else if (frequency === 'biannual') nextShipDate.setMonth(nextShipDate.getMonth() + 6);
    else nextShipDate.setMonth(nextShipDate.getMonth() + 1);

    const subscription = await prisma.autoshipSubscription.create({
      data: {
        accountId: customer.accountId,
        bundleId,
        frequency,
        items: bundle.items as any,
        nextShipDate,
        status: 'active'
      }
    });

    return NextResponse.json({ success: true, data: subscription });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const customer = await verifyCustomerToken(request);
    if (!customer || !customer.accountId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { subscriptionId, action, frequency } = await request.json();
    if (!subscriptionId || !action) {
      return NextResponse.json({ success: false, error: 'Subscription ID and action are required' }, { status: 400 });
    }

    const existing = await prisma.autoshipSubscription.findFirst({
      where: { id: subscriptionId, accountId: customer.accountId }
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Subscription not found' }, { status: 404 });
    }

    const dataToUpdate: any = {};
    if (action === 'pause') dataToUpdate.status = 'paused';
    else if (action === 'resume') dataToUpdate.status = 'active';
    else if (action === 'cancel') dataToUpdate.status = 'cancelled';
    else if (action === 'change_frequency' && frequency) dataToUpdate.frequency = frequency;

    const subscription = await prisma.autoshipSubscription.update({
      where: { id: subscriptionId },
      data: dataToUpdate
    });

    return NextResponse.json({ success: true, data: subscription });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Internal server error' }, { status: 500 });
  }
}
