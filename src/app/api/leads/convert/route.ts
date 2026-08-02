import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getZohoAccessToken } from "@/lib/zoho-auth"

const ZOHO_DC = process.env.ZOHO_DC || "com"

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { leadId, factFinding, address, companyName, contactFirstName, contactLastName, phone, email } = await req.json()

    // Fetch Lead if leadId passed
    let lead = null
    if (leadId) {
      lead = await prisma.lead.findFirst({
        where: { OR: [{ id: leadId }, { zohoId: leadId }] }
      })
    }

    const targetCompanyName = companyName || lead?.company || "New Converted Account"
    const targetOwnerId = session.user.id // Always default owner to logged in user creating/converting

    // Generate unique zohoId for account if not converted from Zoho
    const accountZohoId = lead?.zohoId && !lead.zohoId.startsWith("lead_local_")
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
        shippingZip: zip
      }
    })

    // 2. Create Primary Contact
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
        email: contactEmail,
        isPrimary: true,
        mailingStreet: street,
        mailingCity: city,
        mailingState: state,
        mailingZip: zip
      }
    })

    // 3. Mark Lead as Converted if Lead exists
    if (lead) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: "Converted",
          convertedAccountId: newAccount.id
        }
      })

      // Try converting in Zoho CRM if real Zoho Lead
      if (lead.zohoId && !lead.zohoId.startsWith("lead_local_")) {
        try {
          const token = await getZohoAccessToken()
          await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Leads/${lead.zohoId}/actions/convert`, {
            method: "POST",
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              data: [{
                overwrite: true,
                notify_lead_owner: true,
                notify_new_entity_owner: true
              }]
            })
          })
        } catch (e) {
          console.error("Zoho Lead convert API error:", e)
        }
      }
    }

    return NextResponse.json({
      success: true,
      accountId: newAccount.id,
      message: "Lead successfully converted to Account"
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
