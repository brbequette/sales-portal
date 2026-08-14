import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { easyshipShipmentIds, preferredDate, preferredTimeSlot } = await req.json();

    if (!easyshipShipmentIds || !Array.isArray(easyshipShipmentIds) || easyshipShipmentIds.length === 0) {
      return NextResponse.json({ error: 'easyshipShipmentIds must be a non-empty array' }, { status: 400 });
    }

    console.log(`Scheduling pickup for shipments: ${easyshipShipmentIds.join(', ')}`);

    const EASYSHIP_URL = (process.env.EASYSHIP_API_URL || 'https://public-api.easyship.com').replace(/\/+$/, '');
    const API_URL = EASYSHIP_URL.match(/\/\d{4}-\d{2}$/) ? EASYSHIP_URL : EASYSHIP_URL + '/2024-09';
    const apiKey = process.env.EASYSHIP_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'EASYSHIP_API_KEY is not configured' }, { status: 500 });
    }

    const payload: any = {
      shipments: easyshipShipmentIds.map(id => ({ easyship_shipment_id: id })),
    };

    if (preferredDate) payload.preferred_date = preferredDate;
    if (preferredTimeSlot) payload.preferred_time_slot = preferredTimeSlot;

    const response = await fetch(`${API_URL}/pickups`, { signal: AbortSignal.timeout(15000),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Easyship schedule pickup error:', errorText);
      return NextResponse.json({ error: `Failed to schedule pickup: ${errorText}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in schedule-pickup:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
