import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"

import { prisma } from "./lib/prisma"
const ZOHO_DC = process.env.ZOHO_DC || 'com';

export const handler: Handler = async (event) => {
  const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ success: false, error: "Method not allowed" }) }

  try {
    const body = JSON.parse(event.body || "{}")
    const { 
      accountName, phone, email, industry, tags, 
      billingStreet, billingCity, billingState, billingCode, billingCountry,
      shippingStreet, shippingCity, shippingState, shippingCode, shippingCountry,
      firstName, lastName, contactEmail, contactPhone, repId
    } = body

    if (!accountName) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Account Name is required" }) }
    }

    // Find creating user to assign as Account Owner
    let creatorUser = null
    if (repId) {
      creatorUser = await prisma.user.findFirst({
        where: { OR: [{ id: repId }, { zohoId: repId }, { email: repId }] }
      })
    }

    const token = await getZohoAccessToken();
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/crm/v3`;

    // 1. Create Account in Zoho CRM
    const accountPayload: any = {
      Account_Name: accountName,
      Phone: phone,
      Email: email,
      Industry: industry,
      Billing_Street: billingStreet,
      Billing_City: billingCity,
      Billing_State: billingState,
      Billing_Code: billingCode,
      Billing_Country: billingCountry,
      Shipping_Street: shippingStreet,
      Shipping_City: shippingCity,
      Shipping_State: shippingState,
      Shipping_Code: shippingCode,
      Shipping_Country: shippingCountry,
    }

    if (creatorUser?.zohoId) {
      accountPayload.Owner = { id: creatorUser.zohoId }
    }
    
    if (tags) {
      // Tags in CRM API are usually an array of strings
      accountPayload.Tag = tags.split(',').map((t: string) => ({ name: t.trim() })).filter((t: any) => t.name)
    }

    const crmRes = await fetch(`${baseUrl}/Accounts`, { signal: AbortSignal.timeout(15000),
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        data: [accountPayload],
        trigger: ["assignment_rule", "workflow", "blueprint"]
      })
    })

    const crmData = await crmRes.json()
    if (!crmRes.ok || crmData.data?.[0]?.code !== 'SUCCESS') {
      console.error("Zoho CRM Account Creation Failed:", crmData)
      return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: "Failed to create account in Zoho CRM", details: crmData }) }
    }

    const newAccountId = crmData.data[0].details.id

    // 2. Create Contact in Zoho CRM (if provided)
    if (firstName || lastName) {
      const contactPayload = {
        First_Name: firstName,
        Last_Name: lastName || 'Unknown',
        Email: contactEmail || email,
        Phone: contactPhone || phone,
        Account_Name: { id: newAccountId }
      }
      
      const contactRes = await fetch(`${baseUrl}/Contacts`, { signal: AbortSignal.timeout(15000),
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: [contactPayload] })
      })
      const contactData = await contactRes.json()
      if (!contactRes.ok || contactData.data?.[0]?.code !== 'SUCCESS') {
        console.warn("Failed to create Contact in Zoho CRM. Account was created.", contactData)
      }
    }

    // Fetch the newly created account from Zoho CRM to find out who the CRM assigned it to
    let ownerId = null
    const fetchRes = await fetch(`${baseUrl}/Accounts/${newAccountId}`, { signal: AbortSignal.timeout(15000),
      headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
    })
    
    if (fetchRes.ok) {
      const fetchData = await fetchRes.json()
      const record = fetchData.data?.[0]
      const ownerZohoId = record?.Owner?.id
      const ownerName = record?.Owner?.name
      
      if (ownerZohoId) {
        let dbOwner = await prisma.user.findUnique({ where: { zohoId: ownerZohoId } })
        if (!dbOwner) {
          dbOwner = await prisma.user.create({
            data: {
              zohoId: ownerZohoId,
              name: ownerName || "Unknown Owner",
              email: `${ownerZohoId}@dummy.titandiamond.com`,
              role: "Sales Representative"
            }
          })
        }
        ownerId = dbOwner.id
      }
    }

    // Fallback if we couldn't fetch or map the owner
    if (!ownerId) {
      const fallbackUser = await prisma.user.findFirst()
      if (fallbackUser) ownerId = fallbackUser.id
      else throw new Error("No owner found and no users in database")
    }

    const prismaAccount = await prisma.account.create({
      data: {
        zohoId: newAccountId,
        name: accountName,
        industry: industry || null,
        tags: tags || null,
        status: 'Open',
        quality: 'NEVER_STATUSED',
        ownerId: ownerId as string,
      }
    })

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, zohoId: newAccountId, account: prismaAccount })
    }

  } catch (err: any) {
    console.error("create-account error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
