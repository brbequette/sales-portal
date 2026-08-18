import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { easyshipShipmentId, packageId } = await req.json();

    if (!easyshipShipmentId) {
      return NextResponse.json({ error: 'easyshipShipmentId is required' }, { status: 400 });
    }

    console.log(`Refreshing Easyship shipment status: ${easyshipShipmentId}`);

    const EASYSHIP_URL = (process.env.EASYSHIP_API_URL || 'https://enterprise-api.easyship.com').replace(/\/+$/, '');
    const API_URL = EASYSHIP_URL.match(/\/\d{4}-\d{2}$/) ? EASYSHIP_URL : EASYSHIP_URL + '/2024-09';
    const apiKey = process.env.EASYSHIP_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'EASYSHIP_API_KEY is not configured' }, { status: 500 });
    }

    const response = await fetch(`${API_URL}/shipments/${easyshipShipmentId}`, { signal: AbortSignal.timeout(15000),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Easyship refresh status error:', errorText);
      return NextResponse.json({ error: `Failed to refresh status: ${errorText}` }, { status: response.status });
    }

    const data = await response.json();
    const shipment = data.shipment || data;

    const trackingNumber = shipment.trackings?.[0]?.tracking_number || shipment.tracking_number || '';
    const trackingPageUrl = shipment.tracking_page_url || '';
    const labelState = shipment.label_state || '';
    const shipmentState = shipment.shipment_state || '';
    const deliveryState = shipment.delivery_state || '';
    const courierName = shipment.courier?.name || shipment.selected_courier?.name || shipment.courier_service?.name || '';
    const totalCharge = shipment.rates?.selected?.total_charge || shipment.total_charge || 0;
    const shippingDocuments = shipment.shipping_documents || [];

    const extractedData = {
      trackingNumber,
      trackingPageUrl,
      labelState,
      shipmentState,
      deliveryState,
      courierName,
      totalCharge,
      shippingDocuments
    };

    if (packageId) {
      console.log(`Updating local DB for package: ${packageId} after status refresh`);
      
      const newStatus = deliveryState === 'delivered' ? 'delivered' : undefined;

      const updateData: any = {
        trackingNumber: trackingNumber || undefined,
        carrier: courierName || undefined,
        shippingCharge: totalCharge || undefined,
      };

      if (newStatus) {
        updateData.status = newStatus;
      }

      await prisma.package.update({
        where: { id: packageId },
        data: updateData
      });
    }

    return NextResponse.json({ success: true, ...extractedData });
  } catch (error) {
    console.error('Error in refresh-status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
