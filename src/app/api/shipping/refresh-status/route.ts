import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdministrator } from '@/lib/auth-helpers';

export async function POST(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const {
      easyshipShipmentId: inputShipmentId,
      packageId,
      trackingNumber: inputTrackingNumber,
      packageNumber,
      salesOrderNumber
    } = await req.json();

    const EASYSHIP_URL = (process.env.EASYSHIP_API_URL || 'https://enterprise-api.easyship.com').replace(/\/+$/, '');
    const API_URL = EASYSHIP_URL.match(/\/\d{4}-\d{2}$/) ? EASYSHIP_URL : EASYSHIP_URL + '/2024-09';
    const apiKey = process.env.EASYSHIP_API_KEY?.replace(/^["']|["']$/g, '');

    if (!apiKey) {
      return NextResponse.json({ error: 'EASYSHIP_API_KEY is not configured' }, { status: 500 });
    }

    let pkg: any = null;
    if (packageId) {
      pkg = await prisma.package.findUnique({ where: { id: packageId } });
    }

    const pkgItems = (pkg?.items as any) || {};
    let targetShipmentId = inputShipmentId || pkgItems.easyshipShipmentId || null;
    const targetTracking = (inputTrackingNumber || pkg?.trackingNumber || '').trim();

    // If no easyshipShipmentId, attempt to find it via tracking number or package number in EasyShip
    if (!targetShipmentId && targetTracking) {
      console.log(`[refresh-status] Searching EasyShip shipments for tracking: ${targetTracking}`);
      try {
        let searchRes = await fetch(`${API_URL}/shipments?tracking_number=${encodeURIComponent(targetTracking)}`, {
          signal: AbortSignal.timeout(10000),
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        });
        let searchData = searchRes.ok ? await searchRes.json() : null;
        let match = searchData?.shipments?.find((s: any) =>
          s.trackings?.some((t: any) => t.tracking_number === targetTracking) ||
          s.tracking_number === targetTracking
        );

        if (!match) {
          searchRes = await fetch(`${API_URL}/shipments?search=${encodeURIComponent(targetTracking)}`, {
            signal: AbortSignal.timeout(10000),
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
          });
          searchData = searchRes.ok ? await searchRes.json() : null;
          match = searchData?.shipments?.find((s: any) =>
            s.trackings?.some((t: any) => t.tracking_number === targetTracking) ||
            s.tracking_number === targetTracking
          );
        }

        if (!match) {
          searchRes = await fetch(`${API_URL}/shipments?per_page=100`, {
            signal: AbortSignal.timeout(10000),
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
          });
          searchData = searchRes.ok ? await searchRes.json() : null;
          match = searchData?.shipments?.find((s: any) =>
            s.trackings?.some((t: any) => t.tracking_number === targetTracking) ||
            s.tracking_number === targetTracking
          );
        }

        if (match) {
          targetShipmentId = match.easyship_shipment_id;
          console.log(`[refresh-status] Matched tracking ${targetTracking} to EasyShip ID: ${targetShipmentId}`);
        }
      } catch (searchErr) {
        console.warn('[refresh-status] Failed searching EasyShip by tracking:', searchErr);
      }
    }

    // Fallback: search by package number (e.g. PKG-25388) or SO number
    if (!targetShipmentId && (packageNumber || pkg?.packageNumber || salesOrderNumber || pkg?.salesOrderNumber)) {
      const queryStr = (packageNumber || pkg?.packageNumber || salesOrderNumber || pkg?.salesOrderNumber || '').trim();
      console.log(`[refresh-status] Searching EasyShip shipments for query: ${queryStr}`);
      try {
        const searchRes = await fetch(`${API_URL}/shipments?search=${encodeURIComponent(queryStr)}`, {
          signal: AbortSignal.timeout(10000),
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.shipments?.length > 0) {
            targetShipmentId = searchData.shipments[0].easyship_shipment_id;
            console.log(`[refresh-status] Matched query ${queryStr} to EasyShip ID: ${targetShipmentId}`);
          }
        }
      } catch (searchErr) {
        console.warn('[refresh-status] Failed searching EasyShip by query:', searchErr);
      }
    }

    if (!targetShipmentId) {
      return NextResponse.json({
        error: 'Could not find a corresponding EasyShip shipment for this package or tracking number.'
      }, { status: 404 });
    }

    console.log(`Refreshing Easyship shipment status: ${targetShipmentId}`);

    const response = await fetch(`${API_URL}/shipments/${targetShipmentId}`, {
      signal: AbortSignal.timeout(15000),
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

    const labelDoc = shippingDocuments.find((d: any) => d.category === 'label');
    const labelUrl = labelDoc?.url || shipment.label_url || '';
    const packingSlipDoc = shippingDocuments.find((d: any) => d.category === 'packing_slip');
    const packingSlipUrl = packingSlipDoc?.url || '';

    const extractedData = {
      easyshipShipmentId: targetShipmentId,
      trackingNumber,
      trackingPageUrl,
      labelUrl,
      packingSlipUrl,
      labelState,
      shipmentState,
      deliveryState,
      courierName,
      totalCharge,
      shippingDocuments
    };

    if (packageId) {
      console.log(`Updating local DB for package: ${packageId} after status refresh`);
      
      const existingItems = (pkg?.items as any) || {};
      const updatedItems = {
        ...existingItems,
        easyshipShipmentId: targetShipmentId,
        ...(labelUrl ? { labelUrl } : {}),
        ...(trackingPageUrl ? { trackingPageUrl } : {}),
        ...(packingSlipUrl ? { packingSlipUrl } : {}),
        ...(courierName ? { carrier: courierName } : {}),
        ...(totalCharge > 0 ? { shippingCharge: totalCharge, easyshipCost: totalCharge } : {})
      };

      const newStatus = deliveryState === 'delivered' ? 'delivered' : undefined;

      const updateData: any = {
        trackingNumber: trackingNumber || undefined,
        carrier: courierName || undefined,
        shippingCharge: totalCharge > 0 ? totalCharge : undefined,
        items: updatedItems
      };

      if (newStatus) {
        updateData.status = newStatus;
      } else if (labelUrl || trackingNumber) {
        if (pkg?.status === 'needs_packaging' || pkg?.status === 'packaged') {
          updateData.status = 'shipped';
        }
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
