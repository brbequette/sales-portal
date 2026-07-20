import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { zip, weight } = await req.json()

    // Mock API response based on weight and zip
    const w = parseFloat(weight) || 10
    
    // Some basic variation based on weight just so it feels a bit realistic
    const groundBase = 15.00
    const twoDayBase = 35.00
    const overnightBase = 65.00

    const weightMultiplier = w > 10 ? 1 + ((w - 10) * 0.05) : 1

    const rates = [
      { service: "UPS Ground", cost: groundBase * weightMultiplier },
      { service: "FedEx 2-Day", cost: twoDayBase * weightMultiplier },
      { service: "FedEx Overnight", cost: overnightBase * weightMultiplier },
    ]

    return NextResponse.json({ success: true, rates })
  } catch (error: any) {
    console.error("Shipping Estimate Error:", error)
    return NextResponse.json({ success: false, error: "Failed to estimate shipping" }, { status: 500 })
  }
}
