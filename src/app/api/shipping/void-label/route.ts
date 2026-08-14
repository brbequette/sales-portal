import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { easyshipShipmentId, packageId } = await req.json();

    if (!easyshipShipmentId) {
      return NextResponse.json({ error: 'easyshipShipmentId is required' }, { status: 400 });
    }

    console.log(`Voiding Easyship label for shipment: ${easyshipShipmentId}`);

    const EASYSHIP_URL = (process.env.EASYSHIP_API_URL || 'https://public-api.easyship.com').replace(/\/+$/, '');
    const API_URL = EASYSHIP_URL.match(/\/\d{4}-\d{2}$/) ? EASYSHIP_URL : EASYSHIP_URL + '/2024-09';
    const apiKey = process.env.EASYSHIP_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'EASYSHIP_API_KEY is not configured' }, { status: 500 });
    }

    const response = await fetch(`${API_URL}/labels/void`, { signal: AbortSignal.timeout(15000),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        shipments: [{ easyship_shipment_id: easyshipShipmentId }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Easyship void label error:', errorText);
      return NextResponse.json({ error: `Failed to void label: ${errorText}` }, { status: response.status });
    }

    if (packageId) {
      console.log(`Updating local DB for package: ${packageId} after voiding label`);

      const pkg = await prisma.package.findUnique({ where: { id: packageId } });
      const existingItems = (pkg?.items as any) || {};

      // Remove label URL and mark as voided
      const { labelUrl: _label, ...rest } = existingItems;
      const updatedItems = { ...rest, labelVoided: true };

      await prisma.package.update({
        where: { id: packageId },
        data: {
          status: 'not_shipped',
          trackingNumber: null,
          shippingCharge: 0,
          items: updatedItems,
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in void-label:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
