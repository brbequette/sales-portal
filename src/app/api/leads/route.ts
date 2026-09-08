import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedDbUser } from "@/lib/session-user"
import { normalizeLeadInput, normalizeLeadPhone, validateLeadInput } from "@/lib/lead-intake"

export async function GET(req: Request) {
  try {
    const auth = await getAuthenticatedDbUser()
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { user, isAdmin } = auth
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search") || ""
    const ownerId = searchParams.get("ownerId")

    // Zoho sync is no longer triggered here.
    // Use POST /api/sync-now with { tables: ['leads'] } for manual or scheduled syncs.
    const where: any = { convertedAccountId: null, AND: [] }
    if (!isAdmin) {
      where.AND.push({ OR: [{ ownerId: user.id }, { claimedById: user.id }] })
    } else if (ownerId && ownerId !== "all" && ownerId !== "All") {
      where.ownerId = ownerId
    }

    if (search) {
      where.AND.push({
        OR: [
          { company: { contains: search, mode: "insensitive" } },
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      })
    }

    const leads = await prisma.lead.findMany({
      where,
      include: { owner: { select: { id: true, name: true, email: true } } },
      orderBy: { updatedAt: "desc" },
      take: 200,
    })

    return NextResponse.json({ success: true, leads })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}




export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedDbUser()
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { user, isAdmin } = auth

    const body = await req.json()
    const {
      id, zohoId, company, firstName, lastName, email, phone, mobile,
      title, industry, status, street, city, state, zip,
      bladeSizes, materialsCut, currentSupplier, averageBladeCost, crewCount, bladesPerOrder, improvementPriority
    } = body

    const targetOwnerId = isAdmin && body.ownerId ? body.ownerId : user.id

    let lead: any = null
    if (id || zohoId) {
      const existingLead = await prisma.lead.findFirst({
        where: id ? { id } : { zohoId },
        select: { ownerId: true, claimedById: true },
      })
      if (!existingLead) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 })
      }
      if (!isAdmin && existingLead.ownerId !== user.id && existingLead.claimedById !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      lead = await prisma.lead.update({
        where: id ? { id } : { zohoId },
        data: {
          company, firstName, lastName, email, phone, mobile, title, industry, status,
          street, city, state, zip, bladeSizes, materialsCut, currentSupplier, averageBladeCost, crewCount, bladesPerOrder, improvementPriority,
          ownerId: targetOwnerId
        }
      })
    } else {
      const normalized = normalizeLeadInput({ company, firstName, lastName, email, phone, mobile, title, industry, street, city, state, zip, timeZone: body.timeZone })
      const errors = validateLeadInput(normalized)
      if (Object.keys(errors).length) return NextResponse.json({ success: false, error: "Lead validation failed", fieldErrors: errors }, { status: 400 })

      const candidates = await prisma.lead.findMany({
        where: { convertedAccountId: null, OR: [
          ...(normalized.email ? [{ email: { equals: normalized.email, mode: "insensitive" as const } }] : []),
          { company: { equals: normalized.company, mode: "insensitive" as const } },
        ] },
        select: { id: true, company: true, firstName: true, lastName: true, email: true, phone: true, mobile: true },
      })
      const incomingPhones = new Set([normalized.phone, normalized.mobile].filter(Boolean))
      const duplicate = candidates.find(candidate =>
        (normalized.email && candidate.email?.toLowerCase() === normalized.email) ||
        (candidate.company.toLowerCase() === normalized.company.toLowerCase() && [candidate.phone, candidate.mobile].some(value => incomingPhones.has(normalizeLeadPhone(value))))
      )
      if (duplicate) return NextResponse.json({ success: false, error: "A matching unconverted lead already exists.", duplicate }, { status: 409 })

      const generatedZohoId = `lead_local_${Date.now()}`
      lead = await prisma.lead.create({
        data: {
          zohoId: generatedZohoId,
          ...normalized, status: status || "New Lead",
          bladeSizes, materialsCut, currentSupplier, averageBladeCost, crewCount, bladesPerOrder, improvementPriority,
          ownerId: targetOwnerId,
          claimedById: targetOwnerId,
          claimedAt: new Date(),
        }
      })
    }

    return NextResponse.json({ success: true, lead })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
