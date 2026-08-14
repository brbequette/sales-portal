import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { easyshipShipmentId, packageId } = await req.json();

    if (!easyshipShipmentId) {
      return NextResponse.json({ error: 'easyshipShipmentId is required' }, { status: 400 });
    }

    console.log(`Cancelling Easyship shipment: ${easyshipShipmentId}`);

    const EASYSHIP_URL = (process.env.EASYSHIP_API_URL || 'https://enterprise-api.easyship.com').replace(/\/+$/, '');
    const API_URL = EASYSHIP_URL.match(/\/\d{4}-\d{2}$/) ? EASYSHIP_URL : EASYSHIP_URL + '/2024-09';
    const apiKey = process.env.EASYSHIP_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'EASYSHIP_API_KEY is not configured' }, { status: 500 });
    }

    const response = await fetch(`${API_URL}/shipments/${easyshipShipmentId}`, { signal: AbortSignal.timeout(15000),
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Easyship cancel shipment error:', errorText);
      return NextResponse.json({ error: `Failed to cancel shipment: ${errorText}` }, { status: response.status });
    }

    if (packageId) {
      console.log(`Updating local DB for package: ${packageId}`);

      const pkg = await prisma.package.findUnique({ where: { id: packageId } });
      const existingItems = (pkg?.items as any) || {};

      // Remove easyship-related fields from items JSON
      const { easyshipShipmentId: _esId, labelUrl: _label, trackingPageUrl: _tp, shippedAt: _sa, ...cleanedItems } = existingItems;

      await prisma.package.update({
        where: { id: packageId },
        data: {
          status: 'not_shipped',
          carrier: null,
          trackingNumber: null,
          shippingCharge: 0,
          items: cleanedItems,
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in cancel-shipment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
