import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getZohoAccessToken } from "@/lib/zoho-auth"

const ZOHO_DC = process.env.ZOHO_DC || "com"

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search") || ""
    const ownerId = searchParams.get("ownerId")
    const sync = searchParams.get("sync") === "true"

    // If explicit sync requested, pull latest Leads from Zoho CRM
    if (sync && session?.user) {
      try {
        const token = await getZohoAccessToken()
        const zRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Leads?per_page=200`, {
          headers: { Authorization: `Zoho-oauthtoken ${token}` }
        })
        if (zRes.ok) {
          const zData = await zRes.json()
          const zLeads = zData.data || []
          for (const zLead of zLeads) {
            if (!zLead.id) continue
            
            // Map Zoho Lead Owner to User
            const ownerZohoId = zLead.Owner?.id
            let localUser = null
            if (ownerZohoId) {
              localUser = await prisma.user.findFirst({
                where: { OR: [{ zohoId: ownerZohoId }, { email: zLead.Owner?.email || "" }] }
              })
            }
            if (!localUser && session.user.id) {
              localUser = await prisma.user.findUnique({ where: { id: session.user.id } })
            }

            if (localUser) {
              await prisma.lead.upsert({
                where: { zohoId: zLead.id },
                update: {
                  company: zLead.Company || zLead.Last_Name || "Unnamed Lead",
                  firstName: zLead.First_Name || null,
                  lastName: zLead.Last_Name || null,
                  email: zLead.Email || null,
                  phone: zLead.Phone || null,
                  mobile: zLead.Mobile || null,
                  title: zLead.Designation || null,
                  industry: zLead.Industry || null,
                  status: zLead.Lead_Status || "New Lead",
                  street: zLead.Street || null,
                  city: zLead.City || null,
                  state: zLead.State || null,
                  zip: zLead.Zip_Code || null,
                  rawData: zLead,
                  zohoModifiedTime: zLead.Modified_Time ? new Date(zLead.Modified_Time) : null
                },
                create: {
                  zohoId: zLead.id,
                  company: zLead.Company || zLead.Last_Name || "Unnamed Lead",
                  firstName: zLead.First_Name || null,
                  lastName: zLead.Last_Name || null,
                  email: zLead.Email || null,
                  phone: zLead.Phone || null,
                  mobile: zLead.Mobile || null,
                  title: zLead.Designation || null,
                  industry: zLead.Industry || null,
                  status: zLead.Lead_Status || "New Lead",
                  ownerId: localUser.id,
                  street: zLead.Street || null,
                  city: zLead.City || null,
                  state: zLead.State || null,
                  zip: zLead.Zip_Code || null,
                  rawData: zLead,
                  zohoModifiedTime: zLead.Modified_Time ? new Date(zLead.Modified_Time) : null
                }
              })
            }
          }
        }
      } catch (e) {
        console.error("Zoho Lead Sync error:", e)
      }
    }

    const where: any = {
      convertedAccountId: null
    }

    if (ownerId && ownerId !== "all" && ownerId !== "All") {
      where.ownerId = ownerId
    }

    if (search) {
      where.OR = [
        { company: { contains: search, mode: "insensitive" } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { email: { contains: search, mode: "insensitive" } }
      ]
    }

    const leads = await prisma.lead.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, email: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 200
    })

    return NextResponse.json({ success: true, leads })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const {
      id, zohoId, company, firstName, lastName, email, phone, mobile,
      title, industry, status, street, city, state, zip,
      bladeSizes, materialsCut, currentSupplier, averageBladeCost, crewCount, bladesPerOrder, improvementPriority
    } = body

    // Always assign logged-in user as owner if not provided
    const targetOwnerId = body.ownerId || session.user.id

    let lead: any = null
    if (id || zohoId) {
      lead = await prisma.lead.update({
        where: id ? { id } : { zohoId },
        data: {
          company, firstName, lastName, email, phone, mobile, title, industry, status,
          street, city, state, zip, bladeSizes, materialsCut, currentSupplier, averageBladeCost, crewCount, bladesPerOrder, improvementPriority,
          ownerId: targetOwnerId
        }
      })
    } else {
      const generatedZohoId = `lead_local_${Date.now()}`
      lead = await prisma.lead.create({
        data: {
          zohoId: generatedZohoId,
          company: company || "New Lead",
          firstName, lastName, email, phone, mobile, title, industry, status: status || "New Lead",
          street, city, state, zip, bladeSizes, materialsCut, currentSupplier, averageBladeCost, crewCount, bladesPerOrder, improvementPriority,
          ownerId: targetOwnerId
        }
      })
    }

    return NextResponse.json({ success: true, lead })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
