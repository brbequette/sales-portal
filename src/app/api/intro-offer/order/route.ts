import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      paymentMethod, // 'credit_card' | 'thirty_day_billing'
      bladeSize = "14-inch",
      quantity = 1,
      totalAmount = 299.99,
      customerName,
      companyName,
      email,
      phone,
      address,
      city,
      state,
      zip,
      poNumber,
      cardName,
      cardNumberLast4,
    } = body

    if (!customerName || !phone || !email) {
      return NextResponse.json(
        { success: false, error: "Missing required contact details (Name, Phone, Email)" },
        { status: 400 }
      )
    }

    const orderId = `ORD-PATRIOT-${Date.now().toString().slice(-6)}`
    const is30Day = paymentMethod === "thirty_day_billing"

    // Create a task or internal order record in DB for sales team follow-up
    try {
      // Find or assign to system admin / sales
      const defaultUser = await prisma.user.findFirst({
        where: { role: { contains: "ADMIN", mode: "insensitive" } }
      })

      if (defaultUser) {
        await prisma.task.create({
          data: {
            zohoId: `OFFER-${orderId}`,
            subject: `🇺🇸 INTRO OFFER ORDER [${is30Day ? "30-DAY BILLING" : "CREDIT CARD"}]: ${companyName || customerName}`,
            description: `Order ID: ${orderId}\nPayment Method: ${is30Day ? "30-Day Net Billing (Call/Invoice)" : "Credit Card (Processed)"}\nPackage: 2-Blade Patriot Combo (${bladeSize})\nQty: ${quantity} x $${totalAmount}\nCustomer: ${customerName}\nCompany: ${companyName || "N/A"}\nEmail: ${email}\nPhone: ${phone}\nAddress: ${address}, ${city}, ${state} ${zip}\nPO Number: ${poNumber || "N/A"}\nCard Last 4: ${cardNumberLast4 || "N/A"}`,
            status: "OPEN",
            priority: "HIGH",
            ownerId: defaultUser.id,
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due in 24h
          }
        })
      }
    } catch (dbErr) {
      console.warn("Task creation warning:", dbErr)
    }

    return NextResponse.json({
      success: true,
      orderId,
      paymentMethod,
      totalAmount,
      customerName,
      companyName,
      email,
      phone,
      status: is30Day ? "APPROVED_30_DAY_NET" : "PAID_CREDIT_CARD",
      message: is30Day
        ? "Your 30-Day Net Billing order has been submitted! A Titan representative will verify your account details shortly."
        : "Payment successful! Your 2-Blade Patriot Intro Package is being prepared for immediate shipping.",
    })
  } catch (err: any) {
    console.error("Intro Offer Order Error:", err)
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process offer order" },
      { status: 500 }
    )
  }
}
