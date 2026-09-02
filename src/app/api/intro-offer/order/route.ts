import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { INTRO_OFFER, INTRO_OFFER_MAX_QUANTITY, introOfferTotal } from "@/lib/intro-offer"

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : ""

export async function POST(request: Request) {
  try {
    const body = await request.json()
    if (clean(body.website, 100)) return NextResponse.json({ success: true, orderId: "RECEIVED" })

    const customerName = clean(body.customerName, 120)
    const companyName = clean(body.companyName, 160)
    const email = clean(body.email, 254).toLowerCase()
    const phone = clean(body.phone, 40)
    const address = clean(body.address, 180)
    const city = clean(body.city, 100)
    const state = clean(body.state, 80)
    const zip = clean(body.zip, 20)
    const poNumber = clean(body.poNumber, 80)
    const fulfillment = body.fulfillment === "sales_assist" ? "sales_assist" : "commercial_invoice"
    const quantity = Number(body.quantity)

    if (!customerName || !email || !phone || !address || !city || !state || !zip) {
      return NextResponse.json({ success: false, error: "Please complete every required contact and delivery field." }, { status: 400 })
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ success: false, error: "Please enter a valid email address." }, { status: 400 })
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > INTRO_OFFER_MAX_QUANTITY) {
      return NextResponse.json({ success: false, error: "Please select a valid pack quantity." }, { status: 400 })
    }

    const owner = await prisma.user.findFirst({
      where: { role: { contains: "ADMIN", mode: "insensitive" } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })
    if (!owner) {
      return NextResponse.json({ success: false, error: "Order routing is temporarily unavailable. Please call us to place this offer." }, { status: 503 })
    }

    const totalAmount = introOfferTotal(quantity)
    const orderId = `PAT-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`
    const methodLabel = fulfillment === "sales_assist" ? "Sales representative follow-up" : "Commercial invoice review"
    await prisma.task.create({
      data: {
        zohoId: `INTRO-${orderId}`,
        subject: `INTRO OFFER REQUEST: ${companyName || customerName} — ${quantity} pack${quantity === 1 ? "" : "s"}`,
        description: [
          `Reference: ${orderId}`,
          `Status: PENDING CONFIRMATION — not paid and not credit-approved`,
          `Offer: ${INTRO_OFFER.headline} ${INTRO_OFFER.productName}`,
          `SKU: ${INTRO_OFFER.sku}`,
          `Package: ${INTRO_OFFER.unitsPerPack} x ${INTRO_OFFER.bladeSize} blades per pack`,
          `Quantity: ${quantity} pack${quantity === 1 ? "" : "s"} (${quantity * INTRO_OFFER.unitsPerPack} blades)`,
          `Offer total: $${totalAmount.toFixed(2)} with free freight`,
          `Requested fulfillment: ${methodLabel}`,
          `Customer: ${customerName}`,
          `Company: ${companyName || "N/A"}`,
          `Email: ${email}`,
          `Phone: ${phone}`,
          `Delivery: ${address}, ${city}, ${state} ${zip}`,
          `PO number: ${poNumber || "N/A"}`,
        ].join("\n"),
        status: "OPEN",
        priority: "HIGH",
        ownerId: owner.id,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })

    return NextResponse.json({
      success: true,
      orderId,
      status: "PENDING_CONFIRMATION",
      totalAmount,
      message: "Your Patriot BOGO request is in our sales queue. A Titan representative will confirm availability, billing, and delivery details before anything is processed.",
    }, { status: 201 })
  } catch (error) {
    console.error("Intro offer request error:", error)
    return NextResponse.json({ success: false, error: "We could not save your request. Please call (480) 470-2577 for immediate help." }, { status: 500 })
  }
}
