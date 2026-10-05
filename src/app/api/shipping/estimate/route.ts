import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { COMPANY_CONFIG } from "@/lib/company-config";
import { getEasyshipRates, getEasyshipBoxes, findBestDeal, getExistingShipmentRates, EasyshipRate } from "@/lib/easyship";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const MOCK_RATES = [
  {
    courierServiceId: "mock-usps-priority",
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
    courierServiceId: "mock-fedex-express",
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
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
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
      originAddress,
      packageId,
      packageNumber,
      soNumber,
      items,
      boxPreset,
      saveBox,
      forceRefresh,
    } = body;

    // Validate ZIP/Postal code format for US destination
    const targetCountry = country || "US";
    if (targetCountry === "US" && !/^\d{5}(-\d{4})?$/.test(zip || "")) {
      return NextResponse.json(
        { success: false, error: "Invalid ZIP code format (must be 5 digits)", rates: [] },
        { status: 400 }
      );
    }

    // Validate weight limits
    const parsedWeight = parseFloat(weight);
    if (isNaN(parsedWeight) || parsedWeight <= 0 || parsedWeight > 1000) {
      return NextResponse.json(
        { success: false, error: "Weight must be a positive number up to 1000 lbs", rates: [] },
        { status: 400 }
      );
    }

    const parsedLength = parseFloat(length) || 12;
    const parsedWidth = parseFloat(width) || 9;
    const parsedHeight = parseFloat(height) || 3;

    // ── Save Box Information to Package in DB ─────────────────────────
    // When the user changes dimensions/weight and clicks refresh, persist to Prisma Package
    let savedPackage: any = null;
    const targetPkgId = packageId;
    if (targetPkgId) {
      try {
        const existingPkg = await prisma.package.findUnique({ where: { id: targetPkgId } });
        if (existingPkg) {
          const existingItems = (existingPkg.items && typeof existingPkg.items === 'object' && !Array.isArray(existingPkg.items))
            ? (existingPkg.items as any)
            : (Array.isArray(existingPkg.items) ? { lineItems: existingPkg.items } : {});

          const updatedItems = {
            ...existingItems,
            dimensions: {
              length: parsedLength,
              width: parsedWidth,
              height: parsedHeight,
            },
            weight: parsedWeight,
            ...(boxPreset ? { boxPreset } : {}),
            boxSavedAt: new Date().toISOString(),
          };

          savedPackage = await prisma.package.update({
            where: { id: targetPkgId },
            data: { items: updatedItems },
          });
          console.log(`[estimate] Successfully saved box info for package ${targetPkgId} (${existingPkg.packageNumber || ''}): ${parsedLength}x${parsedWidth}x${parsedHeight} @ ${parsedWeight} lbs`);
        }
      } catch (saveErr) {
        console.error(`[estimate] Failed saving box for package ${targetPkgId}:`, saveErr);
      }
    } else if (packageNumber && (saveBox || forceRefresh)) {
      try {
        const existingPkg = await prisma.package.findFirst({
          where: {
            OR: [
              { packageNumber: packageNumber },
              { zohoId: packageNumber }
            ]
          }
        });
        if (existingPkg) {
          const existingItems = (existingPkg.items && typeof existingPkg.items === 'object' && !Array.isArray(existingPkg.items))
            ? (existingPkg.items as any)
            : (Array.isArray(existingPkg.items) ? { lineItems: existingPkg.items } : {});

          const updatedItems = {
            ...existingItems,
            dimensions: {
              length: parsedLength,
              width: parsedWidth,
              height: parsedHeight,
            },
            weight: parsedWeight,
            ...(boxPreset ? { boxPreset } : {}),
            boxSavedAt: new Date().toISOString(),
          };

          savedPackage = await prisma.package.update({
            where: { id: existingPkg.id },
            data: { items: updatedItems },
          });
          console.log(`[estimate] Successfully saved box info for package by pkgNumber ${packageNumber}: ${parsedLength}x${parsedWidth}x${parsedHeight} @ ${parsedWeight} lbs`);
        }
      } catch (saveErr) {
        console.error(`[estimate] Failed saving box by pkgNumber ${packageNumber}:`, saveErr);
      }
    }

    const hasApiKey = !!process.env.EASYSHIP_API_KEY;

    if (!hasApiKey) {
      return NextResponse.json({
        success: true,
        isLive: false,
        rates: MOCK_RATES,
        savedBox: !!savedPackage,
        package: savedPackage,
      });
    }

    let rates: EasyshipRate[] = [];
    let fromExistingShipment = false;

    // 1. If packageNumber is provided (e.g. PKG-25385), check if Easyship already synced it
    // with exact pre-calculated courier rates and contract discounts.
    // CRITICAL: If forceRefresh or saveBox is requested (the user modified the box/weight and clicked refresh),
    // we MUST recalculate live rates for the newly specified box!
    if (packageNumber && !forceRefresh && !saveBox) {
      try {
        const existingData = await getExistingShipmentRates(packageNumber, {
          weight: parsedWeight,
          dimensions: { length: parsedLength, width: parsedWidth, height: parsedHeight },
        });
        if (existingData && existingData.rates.length > 0) {
          rates = existingData.rates;
          fromExistingShipment = true;
          console.log(`[estimate] Using ${rates.length} pre-calculated rates from existing shipment for ${packageNumber}`);
        }
      } catch (e) {
        console.warn(`[estimate] Could not retrieve existing rates for ${packageNumber}:`, e);
      }
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
        total_actual_weight: parsedWeight,
        box: { slug: "custom" },
        items: [{
          description: "Order Items",
          category: "home_appliances",
          quantity: 1,
          dimensions: {
            length: parsedLength,
            width: parsedWidth,
            height: parsedHeight
          },
          actual_weight: parsedWeight,
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
      if (!fromExistingShipment || rates.length === 0) {
        rates = await getEasyshipRates(params);
      }
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

    // ─── Address & Surcharge Analysis ─────────────────────────────
    const evaluatedRates = responseData.rates || rates || [];
    const residentialSurchargeFound = evaluatedRates.find((r: any) => (r.residentialSurcharge || 0) > 0);
    const remoteAreaSurchargeFound = evaluatedRates.find((r: any) => (r.remoteAreaSurcharge || 0) > 0);
    responseData.addressAnalysis = {
      isResidential: !!residentialSurchargeFound,
      residentialSurcharge: residentialSurchargeFound?.residentialSurcharge || 0,
      isRemoteArea: !!remoteAreaSurchargeFound,
      remoteAreaSurcharge: remoteAreaSurchargeFound?.remoteAreaSurcharge || 0,
      postalCodeValid: true,
      classification: residentialSurchargeFound ? 'residential' : 'commercial',
    };

    // ─── 2. Package Splitting Optimization (For > 40 lbs or multi-item packages) ───
    // Over 40-50 lbs, carriers charge steep heavy package / handling surcharges.
    // Splitting into 2 smaller boxes often slashes rates significantly.
    const shouldCheckSplit = parsedWeight >= 38 || (Array.isArray(items) && items.length > 1 && parsedWeight >= 28);
    if (shouldCheckSplit) {
      try {
        const box1Weight = Math.round((parsedWeight / 2) * 10) / 10;
        const box2Weight = Math.round((parsedWeight - box1Weight) * 10) / 10;
        const splitHeight = Math.max(2, Math.round(parsedHeight / 2));

        const splitBoxParams = {
          ...params,
          parcels: [{
            total_actual_weight: box1Weight,
            box: { slug: "custom" },
            items: [{
              description: "Split Box Portion",
              category: "home_appliances",
              quantity: 1,
              dimensions: {
                length: parsedLength,
                width: parsedWidth,
                height: splitHeight
              },
              actual_weight: box1Weight,
              declared_currency: "USD",
              declared_customs_value: Math.max(0.1, (declaredValue || 100) / 2)
            }]
          }]
        };

        const splitBoxRates = await getEasyshipRates(splitBoxParams);
        if (splitBoxRates && splitBoxRates.length > 0) {
          const splitSorted = [...splitBoxRates].sort((a, b) => a.totalCharge - b.totalCharge);
          const cheapestSingleSplit = splitSorted[0];
          // Two boxes of box1Weight each:
          const totalSplitCost = Math.round((cheapestSingleSplit.totalCharge * 2) * 100) / 100;
          const singleCheapest = responseData.cheapestPrice || 0;

          if (totalSplitCost > 0) {
            const savings = Math.max(0, Math.round((singleCheapest - totalSplitCost) * 100) / 100);
            responseData.splitRecommendation = {
              eligible: true,
              isCheaper: totalSplitCost < singleCheapest,
              savings,
              singlePrice: singleCheapest,
              splitPrice: totalSplitCost,
              carrierName: cheapestSingleSplit.courierName,
              carrierServiceId: cheapestSingleSplit.courierServiceId,
              box1: {
                weight: box1Weight,
                length: parsedLength,
                width: parsedWidth,
                height: splitHeight,
                estimatedPrice: cheapestSingleSplit.totalCharge
              },
              box2: {
                weight: box2Weight,
                length: parsedLength,
                width: parsedWidth,
                height: splitHeight,
                estimatedPrice: cheapestSingleSplit.totalCharge
              },
              summary: totalSplitCost < singleCheapest
                ? `⚡ Smart Split Savings: Splitting this ${parsedWeight} lb shipment into two ${box1Weight} lb boxes saves $${savings.toFixed(2)} with ${cheapestSingleSplit.courierName} ($${totalSplitCost.toFixed(2)} vs $${singleCheapest.toFixed(2)})!`
                : `Rates for two ${box1Weight} lb boxes: $${totalSplitCost.toFixed(2)} total ($${cheapestSingleSplit.totalCharge.toFixed(2)}/box with ${cheapestSingleSplit.courierName}).`
            };
          }
        }
      } catch (splitErr) {
        console.warn("[estimate] Split optimization check failed:", splitErr);
      }
    }

    responseData.savedBox = !!savedPackage;
    responseData.package = savedPackage;

    return NextResponse.json(responseData);

  } catch (error: any) {
    console.error("Shipping estimate error:", error?.message || error);
    const msg = error?.message || "Failed to estimate shipping rates";
    return NextResponse.json(
      { success: false, error: msg, rates: [] },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    const hasApiKey = !!process.env.EASYSHIP_API_KEY;
    if (!hasApiKey) {
      return NextResponse.json({ success: true, isLive: false, connected: false, error: "API key not configured", boxes: [] });
    }

    // Test connection by calling account endpoint
    let connected = false;
    let accountName = COMPANY_CONFIG.name;
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
