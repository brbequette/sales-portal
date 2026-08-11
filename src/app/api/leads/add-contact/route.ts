import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { company, firstName, lastName, phone, email, title, isBuyer } = await req.json()

    if (!company) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 })
    }

    // Find any existing lead for this company to copy matchStatus, claimedById, address, etc.
    const existingLead = await prisma.lead.findFirst({
      where: { company: { equals: company, mode: "insensitive" } },
    })

    const newLead = await prisma.lead.create({
      data: {
        zohoId: `lead_local_contact_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        company: company.trim(),
        firstName: firstName?.trim() || null,
        lastName: lastName?.trim() || "Contact",
        phone: phone?.trim() || null,
        mobile: phone?.trim() || null,
        email: email?.trim() || null,
        title: title?.trim() || null,
        ownerId: existingLead?.ownerId || session.user.id,
        claimedById: session.user.id,
        claimedAt: new Date(),
        matchStatus: existingLead?.matchStatus || "CONFIRMED",
        street: existingLead?.street || null,
        city: existingLead?.city || null,
        state: existingLead?.state || null,
        zip: existingLead?.zip || null,
        disposition: isBuyer ? "PRIMARY_BUYER" : null,
      },
    })

    return NextResponse.json({
      success: true,
      lead: newLead,
      message: `Added new contact '${firstName || ""} ${lastName || ""}' for ${company}`,
    })
  } catch (error: any) {
    console.error("Error adding lead contact:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
