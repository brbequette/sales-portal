import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { easyshipShipmentId, packageId } = await req.json();

    if (!easyshipShipmentId) {
      return NextResponse.json({ error: 'easyshipShipmentId is required' }, { status: 400 });
    }

    console.log(`Cancelling Easyship shipment: ${easyshipShipmentId}`);

    const EASYSHIP_URL = (process.env.EASYSHIP_API_URL || 'https://public-api.easyship.com').replace(/\/+$/, '');
    const API_URL = EASYSHIP_URL.match(/\/\d{4}-\d{2}$/) ? EASYSHIP_URL : EASYSHIP_URL + '/2024-09';
    const apiKey = process.env.EASYSHIP_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'EASYSHIP_API_KEY is not configured' }, { status: 500 });
    }

    const response = await fetch(`${API_URL}/shipments/${easyshipShipmentId}`, {
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
      let updatedItemsJson = pkg?.itemsJson || null;

      if (pkg?.itemsJson) {
        try {
          const itemsData = typeof pkg.itemsJson === 'string' ? JSON.parse(pkg.itemsJson) : pkg.itemsJson;
          if (itemsData && typeof itemsData === 'object') {
            const newItemsData = { ...itemsData };
            delete newItemsData.easyshipShipmentId;
            updatedItemsJson = newItemsData;
          }
        } catch (e) {
          console.error('Error parsing itemsJson:', e);
        }
      }

      await prisma.package.update({
        where: { id: packageId },
        data: {
          status: 'not_shipped',
          carrier: null,
          trackingNumber: null,
          itemsJson: updatedItemsJson !== null ? updatedItemsJson : undefined,
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in cancel-shipment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
