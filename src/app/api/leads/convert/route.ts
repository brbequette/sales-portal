import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getZohoAccessToken } from "@/lib/zoho-auth"
import { getAuthenticatedDbUser } from "@/lib/session-user"

const ZOHO_DC = process.env.ZOHO_DC || "com"

export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedDbUser()
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      leadId,
      buyerLeadId,
      excludedLeadIds = [],
      factFinding,
      address,
      companyName,
      contactFirstName,
      contactLastName,
      phone,
      email,
    } = await req.json()

    // Determine target lead
    const targetLeadId = buyerLeadId || leadId
    let lead = null
    if (targetLeadId) {
      lead = await prisma.lead.findFirst({
        where: { OR: [{ id: targetLeadId }, { zohoId: targetLeadId }] },
      })
    }
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }
    if (!auth.isAdmin && lead.ownerId !== auth.user.id && lead.claimedById !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const targetCompanyName = companyName || lead?.company || "New Converted Account"
    const targetOwnerId = auth.user.id

    const accountZohoId =
      lead?.zohoId && !lead.zohoId.startsWith("lead_local_")
        ? `acc_from_${lead.zohoId}`
        : `acc_local_${Date.now()}`

    // Merge fact-finding specs
    const bladeSizes = factFinding?.bladeSizes || lead?.bladeSizes || null
    const materialsCut = factFinding?.materialsCut || lead?.materialsCut || null
    const currentSupplier = factFinding?.currentSupplier || lead?.currentSupplier || null
    const averageBladeCost = factFinding?.averageBladeCost || lead?.averageBladeCost || null
    const crewCount = factFinding?.crewCount || lead?.crewCount || null
    const bladesPerOrder = factFinding?.bladesPerOrder || lead?.bladesPerOrder || null
    const improvementPriority = factFinding?.improvementPriority || lead?.improvementPriority || null

    // Address
    const street = address?.street || lead?.street || null
    const city = address?.city || lead?.city || null
    const state = address?.state || lead?.state || null
    const zip = address?.zip || lead?.zip || null

    // 1. Create local Account
    const newAccount = await prisma.account.create({
      data: {
        zohoId: accountZohoId,
        name: targetCompanyName,
        ownerId: targetOwnerId,
        status: "Open",
        quality: "WARM",
        bladeSizes,
        materialsCut,
        currentSupplier,
        averageBladeCost,
        crewCount,
        bladesPerOrder,
        improvementPriority,
        billingStreet: street,
        billingCity: city,
        billingState: state,
        billingZip: zip,
        shippingStreet: street,
        shippingCity: city,
        shippingState: state,
        shippingZip: zip,
      },
    })

    // 2. Create Primary Buyer Contact
    const firstName = contactFirstName || lead?.firstName || null
    const lastName = contactLastName || lead?.lastName || "Contact"
    const contactPhone = phone || lead?.phone || lead?.mobile || null
    const contactEmail = email || lead?.email || null

    await prisma.contact.create({
      data: {
        zohoId: `cnt_${newAccount.id}`,
        accountId: newAccount.id,
        firstName,
        lastName,
        phone: contactPhone,
        mobilePhone: lead?.mobile || null,
        email: contactEmail,
        designation: lead?.title || "Primary Buyer",
        isPrimary: true,
        mailingStreet: street,
        mailingCity: city,
        mailingState: state,
        mailingZip: zip,
      },
    })

    // 3. Convert all other non-excluded matching leads for this company
    const excludedSet = new Set<string>(excludedLeadIds.map((id: any) => String(id)))
    if (lead?.id) excludedSet.add(lead.id)

    const matchingLeads = await prisma.lead.findMany({
      where: {
        company: { equals: targetCompanyName, mode: "insensitive" },
        status: { not: "Converted" },
        ...(!auth.isAdmin ? { OR: [{ ownerId: auth.user.id }, { claimedById: auth.user.id }] } : {}),
      },
    })

    for (const otherLead of matchingLeads) {
      // Mark as converted
      await prisma.lead.update({
        where: { id: otherLead.id },
        data: {
          status: "Converted",
          convertedAccountId: newAccount.id,
        },
      })

      // Skip excluded contacts from being converted as contacts under the Account
      if (excludedSet.has(otherLead.id)) continue
      const isExcludedDisp = [
        "NO_LONGER_WITH_COMPANY",
        "OUT_OF_BUSINESS",
        "WRONG_NUMBER",
        "DO_NOT_CALL",
        "LEFT_COMPANY",
        "EXCLUDED",
      ].includes(otherLead.disposition || "")

      if (isExcludedDisp) continue

      await prisma.contact.create({
        data: {
          zohoId: otherLead.zohoId ? `cnt_lead_${otherLead.zohoId}` : `cnt_lead_${otherLead.id}`,
          accountId: newAccount.id,
          firstName: otherLead.firstName,
          lastName: otherLead.lastName || "Contact",
          email: otherLead.email,
          phone: otherLead.phone || otherLead.mobile,
          mobilePhone: otherLead.mobile,
          designation: otherLead.title || null,
          isPrimary: false,
          mailingStreet: otherLead.street,
          mailingCity: otherLead.city,
          mailingState: otherLead.state,
          mailingZip: otherLead.zip,
        },
      })
    }

    // Try converting in Zoho CRM if real Zoho Lead
    if (lead?.zohoId && !lead.zohoId.startsWith("lead_local_")) {
      try {
        const token = await getZohoAccessToken()
        await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Leads/${lead.zohoId}/actions/convert`, { signal: AbortSignal.timeout(15000),
          method: "POST",
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data: [
              {
                overwrite: true,
                notify_lead_owner: true,
                notify_new_entity_owner: true,
              },
            ],
          }),
        })
      } catch (e) {
        console.error("Zoho Lead convert API error:", e)
      }
    }

    return NextResponse.json({
      success: true,
      accountId: newAccount.id,
      message: `Company '${targetCompanyName}' successfully converted to Account!`,
    })
  } catch (error: any) {
    console.error("Error converting company to account:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
