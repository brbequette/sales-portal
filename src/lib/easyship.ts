import { prisma } from '@/lib/prisma';
import { COMPANY_CONFIG } from '@/lib/company-config';

const _rawUrl = (process.env.EASYSHIP_API_URL || 'https://enterprise-api.easyship.com').replace(/\/+$/, '');
export const EASYSHIP_API_URL = _rawUrl.match(/\/\d{4}-\d{2}$/) ? _rawUrl : `${_rawUrl}/2024-09`;

export interface Address {
  line_1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_alpha2?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  company_name?: string;
}

export function getDefaultOrigin(): Address {
  return {
    line_1: COMPANY_CONFIG.address.line1,
    city: COMPANY_CONFIG.address.city,
    state: COMPANY_CONFIG.address.state,
    postal_code: COMPANY_CONFIG.address.zip,
    country_alpha2: COMPANY_CONFIG.address.country,
    contact_name: COMPANY_CONFIG.name,
    contact_phone: COMPANY_CONFIG.phone,
    contact_email: COMPANY_CONFIG.shippingEmail,
    company_name: COMPANY_CONFIG.name
  };
}

export function normalizeCountryCode(country: string | undefined | null): string {
  if (!country) return 'US';
  const c = country.trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (c === 'USA' || c === 'US' || c === 'UNITEDSTATES' || c === 'UNITEDSTATESOFAMERICA') {
    return 'US';
  }
  if (c === 'CAN' || c === 'CANADA') {
    return 'CA';
  }
  if (c.length === 2) {
    return c;
  }
  return 'US';
}


export interface ParcelDimensions {
  length: number;
  width: number;
  height: number;
}

export interface ParcelItem {
  description: string;
  category: string;
  quantity: number;
  dimensions: ParcelDimensions;
  actual_weight: number;
  declared_currency?: string;
  declared_customs_value?: number;
}

export interface Parcel {
  total_actual_weight: number;
  box?: { slug?: string };
  items: ParcelItem[];
}

export interface GetRatesParams {
  origin_address?: Address;
  destination_address: Address;
  parcels: Parcel[];
}

export interface EasyshipRate {
  courierName: string;
  umbrellaName: string;
  logoUrl: string;
  totalCharge: number;
  shipmentCharge: number;
  shipmentChargeTotal: number;
  currency: string;
  minDeliveryTime: number | null;
  maxDeliveryTime: number | null;
  costRank: number;
  deliveryTimeRank: number;
  valueForMoneyRank: number;
  fuelSurcharge: number;
  remoteAreaSurcharge: number;
  insuranceFee: number;
  discountAmount: number;
  dimensionsUsed?: ParcelDimensions;
}

export interface BestDealResult extends EasyshipRate {
  isCheapest?: boolean;
  isBestValue?: boolean;
}

function getHeaders() {
  const apiKey = process.env.EASYSHIP_API_KEY;
  if (!apiKey) throw new Error("EASYSHIP_API_KEY is not set");
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${apiKey}`
  };
}

export async function getEasyshipRates(params: GetRatesParams): Promise<EasyshipRate[]> {
  // Use DB origin (SystemSettings) → env var fallback, same as createShipmentAndBuyLabel
  const dbOrigin = await getOriginFromDB();
  const origin_address = params.origin_address || dbOrigin;
  
  const payload = {
    origin_address: {
      ...origin_address,
      country_alpha2: normalizeCountryCode(origin_address?.country_alpha2)
    },
    destination_address: {
      ...params.destination_address,
      country_alpha2: normalizeCountryCode(params.destination_address?.country_alpha2)
    },
    parcels: params.parcels
  };

  const response = await fetch(`${EASYSHIP_API_URL}/rates`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Easyship API error (${response.status}): ${text}`);
  }

  const data = await response.json();
  
  if (!data.rates || !Array.isArray(data.rates)) {
    return [];
  }

  return data.rates.map((rate: any) => ({
    courierServiceId: rate.courier_id || rate.courier_service?.id || '',
    courierName: rate.courier_service?.name || '',
    umbrellaName: rate.courier_service?.umbrella_name || '',
    logoUrl: rate.courier_service?.logo || '',
    totalCharge: rate.total_charge || 0,
    shipmentCharge: rate.shipment_charge || 0,
    shipmentChargeTotal: rate.shipment_charge_total || 0,
    currency: rate.currency || 'USD',
    minDeliveryTime: rate.min_delivery_time || null,
    maxDeliveryTime: rate.max_delivery_time || null,
    costRank: rate.cost_rank || 0,
    deliveryTimeRank: rate.delivery_time_rank || 0,
    valueForMoneyRank: rate.value_for_money_rank || 0,
    fuelSurcharge: rate.fuel_surcharge || 0,
    remoteAreaSurcharge: rate.remote_area_surcharge || 0,
    insuranceFee: rate.insurance_fee || 0,
    discountAmount: rate.discount?.amount || 0,
    dimensionsUsed: params.parcels[0]?.items[0]?.dimensions
  }));
}

export async function getEasyshipBoxes() {
  const response = await fetch(`${EASYSHIP_API_URL}/boxes`, {
    method: 'GET',
    headers: getHeaders()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Easyship API error (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.boxes || [];
}

export async function testEasyshipConnection() {
  const response = await fetch(`${EASYSHIP_API_URL}/account`, {
    method: 'GET',
    headers: getHeaders()
  });

  return response.ok;
}

// Standard box presets for Titan Diamond concrete blades
export const BLADE_BOX_PRESETS = [
  { name: '14" Blade Box', length: 15, width: 15, height: 1, typicalWeight: 5 },
  { name: '16" Blade Box', length: 17, width: 17, height: 1, typicalWeight: 6 },
  { name: '18" Blade Box', length: 19, width: 19, height: 1, typicalWeight: 7 },
  { name: '20" Blade Box', length: 21, width: 21, height: 1, typicalWeight: 8 },
  { name: 'Multi-Blade 15" Box', length: 15, width: 15, height: 4, typicalWeight: 20 },
  { name: 'Multi-Blade 16" Box', length: 16, width: 16, height: 4, typicalWeight: 25 },
  { name: 'Multi-Blade 17" Box', length: 17, width: 17, height: 4, typicalWeight: 30 },
];

export interface FindBestDealResponse {
  rates: BestDealResult[];
  averagePrice: number;
  cheapestPrice: number;
  savingsVsAverage: number;
  variationsTested: number;
  cheapestDimensions: ParcelDimensions | undefined;
}

export async function findBestDeal(params: GetRatesParams): Promise<FindBestDealResponse> {
  const baseDimensions = params.parcels[0]?.items[0]?.dimensions;
  if (!baseDimensions) {
    const rates = await getEasyshipRates(params);
    const prices = rates.map(r => r.totalCharge).filter(p => p > 0);
    const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const cheapest = prices.length ? Math.min(...prices) : 0;
    return {
      rates,
      averagePrice: Math.round(avg * 100) / 100,
      cheapestPrice: Math.round(cheapest * 100) / 100,
      savingsVsAverage: Math.round((avg - cheapest) * 100) / 100,
      variationsTested: 1,
      cheapestDimensions: undefined
    };
  }

  // Diamond blade-specific variations: try the entered dims + nearby standard box sizes
  const variations = [
    { name: 'As Entered', dims: { ...baseDimensions } },
    // Tighter fit: reduce each dim by 1"
    { name: 'Tighter Box', dims: { 
      length: Math.max(1, baseDimensions.length - 1), 
      width: Math.max(1, baseDimensions.width - 1), 
      height: Math.max(0.5, baseDimensions.height) 
    }},
    // Next size up
    { name: 'Next Size Up', dims: { 
      length: baseDimensions.length + 1, 
      width: baseDimensions.width + 1, 
      height: baseDimensions.height 
    }},
    // Slim single-blade fit (blade + 1" square, 0.5" tall)
    { name: 'Slim Single', dims: { 
      length: baseDimensions.length, 
      width: baseDimensions.width, 
      height: Math.max(0.5, Math.min(baseDimensions.height, 1)) 
    }},
    // Multi-blade box (same L×W but 4" tall for stacking)
    { name: 'Multi-Blade Box', dims: { 
      length: baseDimensions.length, 
      width: baseDimensions.width, 
      height: 4 
    }},
  ];

  let allResults: BestDealResult[] = [];

  for (const v of variations) {
    try {
      const vParams = JSON.parse(JSON.stringify(params));
      vParams.parcels[0].items[0].dimensions = v.dims;
      
      const rates = await getEasyshipRates(vParams);
      allResults = [...allResults, ...rates.map(r => ({ ...r, dimensionsUsed: v.dims }))];
    } catch (e) {
      console.error(`Error testing variation ${v.name}:`, e);
    }
  }

  allResults.sort((a, b) => a.totalCharge - b.totalCharge);

  // Calculate average and savings
  const validPrices = allResults.map(r => r.totalCharge).filter(p => p > 0);
  const averagePrice = validPrices.length ? validPrices.reduce((a, b) => a + b, 0) / validPrices.length : 0;
  const cheapestPrice = validPrices.length ? Math.min(...validPrices) : 0;
  const savingsVsAverage = averagePrice - cheapestPrice;

  if (allResults.length > 0) {
    allResults[0].isCheapest = true;
    
    let bestValueRate = allResults[0];
    let bestValueRank = 999;
    
    for (const r of allResults) {
      if (r.valueForMoneyRank > 0 && r.valueForMoneyRank < bestValueRank) {
        bestValueRank = r.valueForMoneyRank;
        bestValueRate = r;
      }
    }
    bestValueRate.isBestValue = true;
  }

  return {
    rates: allResults,
    averagePrice: Math.round(averagePrice * 100) / 100,
    cheapestPrice: Math.round(cheapestPrice * 100) / 100,
    savingsVsAverage: Math.round(savingsVsAverage * 100) / 100,
    variationsTested: variations.length,
    cheapestDimensions: allResults[0]?.dimensionsUsed
  };
}

// ── Ship Now: Create Shipment + Buy Label ─────────────────────────────────

export interface CreateShipmentParams {
  originAddress?: Address;
  destinationAddress: Address;
  destinationContactName: string;
  destinationContactPhone?: string;
  destinationContactEmail?: string;
  courierServiceId: string;
  weight: number;
  dimensions: ParcelDimensions;
  items: Array<{
    description: string;
    quantity: number;
    declaredValue: number;
    weight: number;
  }>;
  platformOrderNumber?: string;  // Zoho SO number
  existingEasyshipId?: string;    // If set, skip shipment creation and just buy the label
}

export interface ShipmentResult {
  easyshipShipmentId: string;
  trackingNumber: string;
  trackingPageUrl: string;
  courierName: string;
  labelUrl: string;
  labelState: string;
  totalCharge: number;
  currency: string;
}

async function getOriginFromDB(): Promise<Address> {
  try {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { startsWith: 'ship_from_' } }
    });
    const s: Record<string, string> = {};
    rows.forEach(r => { s[r.key] = r.value });
    if (s.ship_from_address) {
      const defaults = getDefaultOrigin();
      return {
        line_1: s.ship_from_address || defaults.line_1,
        city: s.ship_from_city || defaults.city,
        state: s.ship_from_state || defaults.state,
        postal_code: s.ship_from_zip || defaults.postal_code,
        country_alpha2: 'US',
        contact_name: s.ship_from_contact_name || defaults.contact_name,
        contact_phone: s.ship_from_phone || defaults.contact_phone,
        contact_email: s.ship_from_email || defaults.contact_email,
        company_name: s.ship_from_company || defaults.company_name,
      };
    }
  } catch (e) {
    console.error('Failed to load origin from DB, using defaults:', e);
  }
  return getDefaultOrigin();
}

export async function createShipmentAndBuyLabel(params: CreateShipmentParams): Promise<ShipmentResult> {
  const dbOrigin = await getOriginFromDB();
  const origin = params.originAddress || dbOrigin;

  let easyshipId = params.existingEasyshipId || '';
  let shipment: any = {};

  // Step 0: If no existing ID known, search EasyShip for a shipment matching this order number
  // This catches cases where EasyShip synced the order via its own platform integration
  if (!easyshipId && params.platformOrderNumber) {
    try {
      const searchRes = await fetch(
        `${EASYSHIP_API_URL}/shipments?platform_order_number=${encodeURIComponent(params.platformOrderNumber)}&per_page=5`,
        { method: 'GET', headers: getHeaders() }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const shipments = searchData.shipments || [];
        // Only reuse shipments that DON'T have a label already requested
        const reusable = shipments.find((s: any) => 
          !s.label_state || s.label_state === 'not_created' || s.label_state === 'failed'
        );
        if (reusable?.easyship_shipment_id) {
          easyshipId = reusable.easyship_shipment_id;
          shipment = reusable;
          console.log(`[easyship] Found reusable shipment (label_state: ${reusable.label_state}) for order ${params.platformOrderNumber}: ${easyshipId}`);
        } else if (shipments.length > 0) {
          console.log(`[easyship] Found ${shipments.length} existing shipments but all have labels already (states: ${shipments.map((s: any) => s.label_state).join(', ')}). Will create new shipment.`);
        }
      }
    } catch (e) {
      console.error('[easyship] Shipment lookup failed (will create new):', e);
    }
  }

  // Step 1: Create shipment ONLY if we don't already have one
  if (!easyshipId) {
    const shipmentPayload = {
      origin_address: {
        line_1: origin.line_1 || '',
        city: origin.city || '',
        state: origin.state || '',
        postal_code: origin.postal_code || '',
        country_alpha2: normalizeCountryCode(origin.country_alpha2),
        contact_name: origin.contact_name || COMPANY_CONFIG.name,
        contact_phone: origin.contact_phone || COMPANY_CONFIG.phone,
        contact_email: origin.contact_email || COMPANY_CONFIG.shippingEmail,
        company_name: origin.company_name || COMPANY_CONFIG.name,
      },
      destination_address: {
        line_1: params.destinationAddress.line_1 || '',
        city: params.destinationAddress.city || '',
        state: params.destinationAddress.state || '',
        postal_code: params.destinationAddress.postal_code || '',
        country_alpha2: normalizeCountryCode(params.destinationAddress.country_alpha2),
        contact_name: params.destinationContactName || 'Customer',
        contact_phone: params.destinationContactPhone || '0000000000',
        contact_email: params.destinationContactEmail || COMPANY_CONFIG.email,
      },
      parcels: [{
        total_actual_weight: params.weight,
        box: { slug: 'custom' },
        items: params.items.map(item => ({
          description: item.description,
          sku: (item as any).sku || '',
          category: 'home_appliances',
          quantity: item.quantity,
          dimensions: params.dimensions,
          actual_weight: item.weight,
          declared_currency: 'USD',
          declared_customs_value: item.declaredValue
        }))
      }],
    };

    const shipRes = await fetch(`${EASYSHIP_API_URL}/shipments`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(shipmentPayload)
    });

    if (!shipRes.ok) {
      const text = await shipRes.text();
      throw new Error(`Easyship create shipment error (${shipRes.status}): ${text.substring(0, 500)}`);
    }

    const shipData = await shipRes.json();
    shipment = shipData.shipment || shipData;
    easyshipId = shipment.easyship_shipment_id || '';
  } else {
    console.log(`Reusing existing Easyship shipment: ${easyshipId}`);
  }

  // Step 2: Buy label via /labels endpoint
  let labelUrl = '';
  let trackingNumber = shipment.trackings?.[0]?.tracking_number || shipment.tracking_number || '';
  let trackingPageUrl = shipment.tracking_page_url || '';
  let labelState = shipment.label_state || '';
  let courierName = shipment.courier?.name || shipment.selected_courier?.name || shipment.courier_service?.name || '';
  let totalCharge = shipment.rates?.selected?.total_charge || shipment.total_charge || 0;
  let currency = shipment.currency || 'USD';

  if (easyshipId) {
    // Easyship 2024-09 API: POST /shipments/{shipment_id}/label
    const labelBody: any = {};
    if (params.courierServiceId) {
      labelBody.courier_service_id = params.courierServiceId;
    }
    console.log(`[easyship] Buying label for shipment ${easyshipId}:`, JSON.stringify(labelBody));

    const labelRes = await fetch(`${EASYSHIP_API_URL}/shipments/${easyshipId}/label`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(labelBody)
    });

    const labelText = await labelRes.text();
    console.log(`[easyship] Label response (${labelRes.status}):`, labelText.substring(0, 1500));

    let labelShipment: any = {};

    if (labelRes.ok) {
      const labelData = JSON.parse(labelText);
      labelShipment = labelData.shipment || labelData.shipments?.[0] || {};
    } else if (labelRes.status === 422 && labelText.includes('labels already requested')) {
      // Label was already purchased on a previous attempt — fetch the shipment to get existing label info
      console.log(`[easyship] Label already requested for ${easyshipId}, fetching existing shipment details...`);
      const getRes = await fetch(`${EASYSHIP_API_URL}/shipments/${easyshipId}`, {
        method: 'GET',
        headers: getHeaders(),
      });
      if (getRes.ok) {
        const getData = await getRes.json();
        labelShipment = getData.shipment || getData;
        console.log(`[easyship] Retrieved existing shipment. label_state: ${labelShipment.label_state}, tracking: ${labelShipment.trackings?.[0]?.tracking_number || 'none'}`);
      } else {
        const getErr = await getRes.text();
        throw new Error(`Label already requested for ${easyshipId} but failed to retrieve details (${getRes.status}): ${getErr.substring(0, 300)}`);
      }
    } else {
      throw new Error(`Easyship label purchase failed (${labelRes.status}): ${labelText.substring(0, 500)}`);
    }
    
    console.log('[easyship] Label shipment keys:', Object.keys(labelShipment).join(', '));

    // Extract shipping documents (label URL)
    labelUrl = labelShipment.shipping_documents?.find((d: any) => d.category === 'label')?.url
      || labelShipment.shipping_documents?.[0]?.url || '';
    
    // Extract tracking info
    trackingNumber = labelShipment.trackings?.[0]?.tracking_number 
      || labelShipment.tracking_number 
      || trackingNumber;
    trackingPageUrl = labelShipment.trackings?.[0]?.tracking_page_url
      || labelShipment.tracking_page_url 
      || trackingPageUrl;
    
    // Label and courier info
    labelState = labelShipment.label_state || 'generated';
    courierName = labelShipment.courier_service?.name 
      || labelShipment.courier?.name 
      || courierName;
    totalCharge = labelShipment.total_charge 
      || labelShipment.shipment_charge_total 
      || totalCharge;
    currency = labelShipment.currency || currency;

    // If we still have no tracking number, log for debugging
    if (!trackingNumber) {
      console.warn('[easyship] WARNING: No tracking number in label response. Full data:', JSON.stringify(labelShipment).substring(0, 2000));
    }
  }

  return {
    easyshipShipmentId: easyshipId,
    trackingNumber,
    trackingPageUrl,
    courierName,
    labelUrl,
    labelState,
    totalCharge,
    currency,
  };
}

