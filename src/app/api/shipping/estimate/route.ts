import { NextResponse } from "next/server";
import { getEasyshipRates, getEasyshipBoxes, findBestDeal } from "@/lib/easyship";

const MOCK_RATES = [
  {
    courierName: "USPS Priority",
    umbrellaName: "USPS",
    logoUrl: "",
    totalCharge: 8.50,
    shipmentCharge: 8.50,
    currency: "USD",
    minDeliveryTime: 2,
    maxDeliveryTime: 3,
    costRank: 1,
    deliveryTimeRank: 2,
    valueForMoneyRank: 1,
    fuelSurcharge: 0,
    remoteAreaSurcharge: 0,
    insuranceFee: 0,
    discountAmount: 0
  },
  {
    courierName: "FedEx Express",
    umbrellaName: "FedEx",
    logoUrl: "",
    totalCharge: 24.00,
    shipmentCharge: 24.00,
    currency: "USD",
    minDeliveryTime: 1,
    maxDeliveryTime: 2,
    costRank: 2,
    deliveryTimeRank: 1,
    valueForMoneyRank: 2,
    fuelSurcharge: 0,
    remoteAreaSurcharge: 0,
    insuranceFee: 0,
    discountAmount: 0
  }
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      zip, 
      city, 
      state, 
      country, 
      weight, 
      length, 
      width, 
      height, 
      declaredValue, 
      findBestDeal: isFindBestDeal,
      originAddress
    } = body;

    const hasApiKey = !!process.env.EASYSHIP_API_KEY;

    if (!hasApiKey) {
      return NextResponse.json({
        success: true,
        isLive: false,
        rates: MOCK_RATES
      });
    }

    const params = {
      destination_address: {
        postal_code: zip,
        city: city || "",
        state: state || "",
        country_alpha2: country || "US"
      },
      ...(originAddress ? {
        origin_address: {
          postal_code: originAddress.zip,
          city: originAddress.city || '',
          state: originAddress.state || '',
          country_alpha2: originAddress.country || 'US'
        }
      } : {}),
      parcels: [{
        total_actual_weight: weight || 1.5,
        box: { slug: "custom" },
        items: [{
          description: "Diamond concrete blades",
          category: "home_appliances",
          quantity: 1,
          dimensions: {
            length: length || 10,
            width: width || 8,
            height: height || 4
          },
          actual_weight: weight || 1.5,
          declared_currency: "USD",
          declared_customs_value: declaredValue || 100
        }]
      }]
    };

    let responseData: any;

    if (isFindBestDeal) {
      const result = await findBestDeal(params);
      responseData = {
        success: true,
        isLive: true,
        rates: result.rates,
        averagePrice: result.averagePrice,
        cheapestPrice: result.cheapestPrice,
        savingsVsAverage: result.savingsVsAverage,
        variationsTested: result.variationsTested,
        cheapestDimensions: result.cheapestDimensions,
        savingsSummary: result.savingsVsAverage > 0 
          ? `Tested ${result.variationsTested} box variations — save $${result.savingsVsAverage.toFixed(2)} vs avg ($${result.averagePrice.toFixed(2)}) by using ${result.cheapestDimensions?.length}"×${result.cheapestDimensions?.width}"×${result.cheapestDimensions?.height}" box`
          : undefined
      };
    } else {
      const rates = await getEasyshipRates(params);
      const prices = rates.map(r => r.totalCharge).filter(p => p > 0);
      const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
      const cheapest = prices.length ? Math.min(...prices) : 0;
      responseData = {
        success: true,
        isLive: true,
        rates,
        averagePrice: Math.round(avg * 100) / 100,
        cheapestPrice: Math.round(cheapest * 100) / 100,
        savingsVsAverage: Math.round((avg - cheapest) * 100) / 100
      };
    }

    return NextResponse.json(responseData);

  } catch (error: any) {
    console.error("Shipping estimate error:", error);
    const msg = error?.message || "Failed to estimate shipping rates"
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const hasApiKey = !!process.env.EASYSHIP_API_KEY;
    if (!hasApiKey) {
      return NextResponse.json({ success: true, isLive: false, connected: false, error: "API key not configured", boxes: [] });
    }

    // Test connection by calling account endpoint
    let connected = false;
    let accountName = "Titan Diamond";
    try {
      const { testEasyshipConnection } = await import("@/lib/easyship");
      connected = await testEasyshipConnection();
    } catch (e) {
      console.error("Connection test failed:", e);
    }

    let boxes: any[] = [];
    try {
      boxes = await getEasyshipBoxes();
    } catch (e) {
      console.error("Box fetch failed:", e);
    }

    return NextResponse.json({ 
      success: true, 
      isLive: true, 
      connected,
      accountName,
      currency: "USD",
      boxes 
    });
  } catch (error) {
    console.error("Shipping boxes error:", error);
    return NextResponse.json(
      { success: false, connected: false, error: "Failed to get shipping info" },
      { status: 500 }
    );
  }
}
