const _rawUrl = (process.env.EASYSHIP_API_URL || 'https://public-api.easyship.com').replace(/\/+$/, '');
export const EASYSHIP_API_URL = _rawUrl.match(/\/\d{4}-\d{2}$/) ? _rawUrl : `${_rawUrl}/2024-09`;

export interface Address {
  line_1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_alpha2?: string;
  contact_name?: string;
  contact_phone?: string;
}

export const DEFAULT_ORIGIN: Address = {
  line_1: "8321 E Evans Road",
  city: "Scottsdale",
  state: "AZ",
  postal_code: "85260",
  country_alpha2: "US",
  contact_name: "Titan Diamond",
  contact_phone: "4805551234"
};

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
    "Authorization": `Bearer ${apiKey}`
  };
}

export async function getEasyshipRates(params: GetRatesParams): Promise<EasyshipRate[]> {
  const origin_address = params.origin_address || DEFAULT_ORIGIN;
  
  const payload = {
    origin_address,
    destination_address: params.destination_address,
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

export async function createShipmentAndBuyLabel(params: CreateShipmentParams): Promise<ShipmentResult> {
  const origin = params.originAddress || DEFAULT_ORIGIN;

  const payload = {
    origin_address: {
      line_1: origin.line_1 || '',
      city: origin.city || '',
      state: origin.state || '',
      postal_code: origin.postal_code || '',
      country_alpha2: origin.country_alpha2 || 'US',
      contact_name: origin.contact_name || 'Titan Diamond',
      contact_phone: origin.contact_phone || '4805551234',
    },
    destination_address: {
      line_1: params.destinationAddress.line_1 || '',
      city: params.destinationAddress.city || '',
      state: params.destinationAddress.state || '',
      postal_code: params.destinationAddress.postal_code || '',
      country_alpha2: params.destinationAddress.country_alpha2 || 'US',
      contact_name: params.destinationContactName,
      contact_phone: params.destinationContactPhone || '',
    },
    parcels: [{
      total_actual_weight: params.weight,
      box: { slug: 'custom' },
      items: params.items.map(item => ({
        description: item.description,
        category: 'jewelry',
        quantity: item.quantity,
        dimensions: params.dimensions,
        actual_weight: item.weight,
        declared_currency: 'USD',
        declared_customs_value: item.declaredValue
      }))
    }],
    courier_selection: {
      selected_courier_id: params.courierServiceId
    },
    buy_label: true,
    buy_label_synchronous: true,
    platform_order_number: params.platformOrderNumber || '',
    metadata: {},
  };

  const response = await fetch(`${EASYSHIP_API_URL}/shipments`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Easyship create shipment error (${response.status}): ${text.substring(0, 300)}`);
  }

  const data = await response.json();
  const shipment = data.shipment || data;

  return {
    easyshipShipmentId: shipment.easyship_shipment_id || '',
    trackingNumber: shipment.trackings?.[0]?.tracking_number || shipment.tracking_number || '',
    trackingPageUrl: shipment.tracking_page_url || '',
    courierName: shipment.courier?.name || shipment.selected_courier?.name || '',
    labelUrl: shipment.label?.url || shipment.label_url || shipment.shipping_documents?.find((d: any) => d.category === 'label')?.url || '',
    labelState: shipment.label_state || 'generated',
    totalCharge: shipment.rates?.selected?.total_charge || shipment.total_charge || 0,
    currency: shipment.currency || 'USD',
  };
}

